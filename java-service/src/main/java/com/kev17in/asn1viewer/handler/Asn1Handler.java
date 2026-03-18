package com.kev17in.asn1viewer.handler;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import com.beanit.asn1bean.ber.types.BerType;
import com.kev17in.asn1viewer.model.Asn1Module;
import com.kev17in.asn1viewer.model.Asn1TypeInfo;
import com.kev17in.asn1viewer.rpc.RpcRequest;
import com.kev17in.asn1viewer.rpc.RpcResponse;
import com.kev17in.asn1viewer.service.Asn1TypeRegistry;
import com.kev17in.asn1viewer.service.ModuleManager;
import com.kev17in.asn1viewer.util.Asn1Util;

import java.lang.reflect.Field;
import java.util.*;
import java.util.function.Supplier;

public class Asn1Handler {

    private static final int MAX_DEPTH = 50;

    public RpcResponse getTypeNames(RpcRequest req) {
        List<String> names = Asn1TypeRegistry.getTypeNames();
        return RpcResponse.success(req.getId(), names);
    }

    public RpcResponse getDefaultTypeNames(RpcRequest req) {
        List<String> names = Asn1TypeRegistry.getDefaultTypeNames();
        return RpcResponse.success(req.getId(), names);
    }

    /**
     * Returns a structured tree of modules -> versions -> types
     */
    public RpcResponse getTypeTree(RpcRequest req) {
        ModuleManager mm = ModuleManager.getInstance();
        JSONArray modulesArr = new JSONArray();

        Map<String, Map<String, List<Asn1TypeInfo>>> grouped = new LinkedHashMap<>();
        for (Asn1Module module : mm.getAllModules()) {
            grouped.computeIfAbsent(module.getModuleName(), k -> new LinkedHashMap<>())
                    .put(module.getVersion(), module.getAllTypes());
        }

        for (var mEntry : grouped.entrySet()) {
            JSONObject mObj = new JSONObject();
            mObj.set("module", mEntry.getKey());
            JSONArray versionsArr = new JSONArray();
            for (var vEntry : mEntry.getValue().entrySet()) {
                JSONObject vObj = new JSONObject();
                vObj.set("version", vEntry.getKey());
                JSONArray typesArr = new JSONArray();
                Set<String> seen = new HashSet<>();
                for (Asn1TypeInfo t : vEntry.getValue()) {
                    if (seen.add(t.getSimpleClassName())) {
                        typesArr.add(t.getSimpleClassName());
                    }
                }
                vObj.set("types", typesArr);
                versionsArr.add(vObj);
            }
            mObj.set("versions", versionsArr);
            modulesArr.add(mObj);
        }

        return RpcResponse.success(req.getId(), modulesArr);
    }

    /**
     * Parse ASN.1 data.
     * params: { module, version, type, encoding: "auto"|"hex"|"base64", data }
     */
    public RpcResponse parseAsn1(RpcRequest req) {
        JSONObject p = req.getParams();
        String moduleName = p.getStr("module");
        String version = p.getStr("version");
        String typeName = p.getStr("type");
        String encoding = p.getStr("encoding", "auto");
        String data = p.getStr("data", "").replaceAll("\\s+", "");

        if (typeName == null || typeName.isEmpty()) {
            return RpcResponse.error(req.getId(), -32602, "Missing 'type' parameter");
        }
        if (data.isEmpty()) {
            return RpcResponse.error(req.getId(), -32602, "Missing 'data' parameter");
        }

        Supplier<? extends BerType> supplier;
        if (moduleName != null && version != null && !moduleName.isEmpty() && !version.isEmpty()) {
            supplier = Asn1TypeRegistry.getSupplier(moduleName, version, typeName);
        } else {
            supplier = Asn1TypeRegistry.getSupplier("    " + typeName);
            if (supplier == null) {
                supplier = Asn1TypeRegistry.getSupplier(typeName);
            }
        }

        if (supplier == null) {
            return RpcResponse.error(req.getId(), -32602, "Unknown type: " + typeName);
        }

        try {
            BerType result;
            if ("base64".equalsIgnoreCase(encoding)) {
                result = Asn1Util.decodeBase64Data(data, supplier);
            } else if ("hex".equalsIgnoreCase(encoding)) {
                result = Asn1Util.decodeHex(data, supplier);
            } else {
                boolean isBase64 = isBase64(data);
                result = isBase64 ? Asn1Util.decodeBase64Data(data, supplier) : Asn1Util.decodeHex(data, supplier);
                encoding = isBase64 ? "base64" : "hex";
            }

            Set<Integer> visited = new HashSet<>();
            Object json = toPlainJson(result, 0, visited);
            JSONObject response = new JSONObject();
            response.set("encoding", encoding);
            response.set("json", json);
            return RpcResponse.success(req.getId(), response);

        } catch (Exception e) {
            return RpcResponse.error(req.getId(), -32000, "Parse failed: " + e.getMessage());
        }
    }

    private boolean isBase64(String input) {
        if (input.matches("^[0-9a-fA-F]+$")) return false;
        try {
            byte[] decoded = java.util.Base64.getDecoder().decode(input);
            return decoded.length > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private List<Field> collectFields(Class<?> cls) {
        List<Field> allFields = new ArrayList<>();
        while (cls != null && cls != Object.class) {
            allFields.addAll(Arrays.asList(cls.getDeclaredFields()));
            cls = cls.getSuperclass();
        }
        return allFields;
    }

    private static final Set<String> SKIP_FIELDS = Set.of(
            "serialVersionUID", "code", "tag", "TAG", "BER_TAG"
    );

    /**
     * Converts a BerType object to a plain JSON structure:
     * - Composite BerType (has sub-BerType fields) -> JSONObject with children
     * - Leaf BerType (no sub-BerType fields) -> toString() for human-readable value
     * - List -> JSONArray
     * - Primitives/Strings -> toString()
     */
    private Object toPlainJson(Object obj, int depth, Set<Integer> visited) {
        if (obj == null || depth > MAX_DEPTH) return null;

        int objId = System.identityHashCode(obj);
        if (visited.contains(objId)) return null;

        Class<?> vc = obj.getClass();

        if (isPrimitive(vc) || obj instanceof String) {
            return obj.toString();
        }

        if (obj instanceof byte[]) {
            return bytesToHex((byte[]) obj);
        }

        if (obj instanceof List) {
            List<?> list = (List<?>) obj;
            JSONArray arr = new JSONArray();
            for (Object elem : list) {
                Object converted = toPlainJson(elem, depth + 1, visited);
                arr.add(converted != null ? converted : "null");
            }
            return arr;
        }

        visited.add(objId);

        // For BerType: check if it has sub-BerType or List children (composite)
        // If not, it's a leaf — use toString() directly for readable value
        if (obj instanceof BerType) {
            List<Field> allFields = collectFields(vc);
            List<Field> compositeChildren = new ArrayList<>();

            for (Field field : allFields) {
                if (java.lang.reflect.Modifier.isStatic(field.getModifiers())) continue;
                if (SKIP_FIELDS.contains(field.getName())) continue;
                try {
                    field.setAccessible(true);
                    Object val = field.get(obj);
                    if (val == null) continue;
                    if (val instanceof BerType || val instanceof List) {
                        compositeChildren.add(field);
                    }
                } catch (IllegalAccessException ignored) {}
            }

            // Leaf BerType: no sub-BerType/List children -> toString()
            if (compositeChildren.isEmpty()) {
                String str = obj.toString();
                return (str != null && !str.isEmpty()) ? str : null;
            }

            // Composite BerType: recurse only into BerType/List children
            JSONObject result = new JSONObject(true);
            boolean hasContent = false;
            for (Field field : compositeChildren) {
                try {
                    field.setAccessible(true);
                    Object val = field.get(obj);
                    if (val == null) continue;
                    Object converted = toPlainJson(val, depth + 1, visited);
                    if (converted != null) {
                        result.set(field.getName(), converted);
                        hasContent = true;
                    }
                } catch (IllegalAccessException ignored) {}
            }

            if (!hasContent) {
                String str = obj.toString();
                return (str != null && !str.isEmpty()) ? str : null;
            }

            if (result.size() == 1 && result.containsKey("value")) {
                return result.get("value");
            }
            return result;
        }

        // Non-BerType complex object: generic field extraction
        JSONObject result = new JSONObject(true);
        List<Field> allFields = collectFields(vc);
        boolean hasChildren = false;

        for (Field field : allFields) {
            if (java.lang.reflect.Modifier.isStatic(field.getModifiers())) continue;
            if (SKIP_FIELDS.contains(field.getName())) continue;
            try {
                field.setAccessible(true);
                Object val = field.get(obj);
                if (val == null) continue;
                Object converted = toPlainJson(val, depth + 1, visited);
                if (converted != null) {
                    result.set(field.getName(), converted);
                    hasChildren = true;
                }
            } catch (IllegalAccessException ignored) {}
        }

        if (!hasChildren) {
            String str = obj.toString();
            return (str != null && !str.isEmpty()) ? str : null;
        }

        return result;
    }

    private boolean isPrimitive(Class<?> c) {
        return c.isPrimitive() || c == Boolean.class || c == Byte.class ||
                c == Character.class || c == Short.class || c == Integer.class ||
                c == Long.class || c == Float.class || c == Double.class ||
                c == java.math.BigInteger.class;
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02X", b & 0xFF));
        return sb.toString();
    }
}
