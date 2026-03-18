package com.kev17in.asn1viewer.handler;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import com.kev17in.asn1viewer.model.Asn1Module;
import com.kev17in.asn1viewer.model.Asn1TypeInfo;
import com.kev17in.asn1viewer.rpc.RpcRequest;
import com.kev17in.asn1viewer.rpc.RpcResponse;
import com.kev17in.asn1viewer.service.Asn1TypeRegistry;
import com.kev17in.asn1viewer.service.JarScanner;
import com.kev17in.asn1viewer.service.ModuleManager;
import com.kev17in.asn1viewer.util.JarNameParser;

import java.io.File;
import java.util.List;
import java.util.Map;

public class ModuleHandler {

    public RpcResponse getModules(RpcRequest req) {
        ModuleManager mm = ModuleManager.getInstance();
        JSONArray arr = new JSONArray();

        for (Asn1Module module : mm.getAllModules()) {
            JSONObject obj = new JSONObject();
            obj.set("moduleId", module.getModuleId());
            obj.set("moduleName", module.getModuleName());
            obj.set("version", module.getVersion());
            obj.set("jarPath", module.getJarPath());
            obj.set("builtin", module.isBuiltin());
            obj.set("createTime", module.getCreateTime());
            obj.set("typeCount", module.getAllTypes().size());
            arr.add(obj);
        }

        return RpcResponse.success(req.getId(), arr);
    }

    public RpcResponse importModule(RpcRequest req) {
        JSONObject p = req.getParams();
        String jarPath = p.getStr("jarPath");
        String moduleName = p.getStr("moduleName");
        String version = p.getStr("version");

        if (jarPath == null || jarPath.isEmpty()) {
            return RpcResponse.error(req.getId(), -32602, "Missing 'jarPath' parameter");
        }

        File jarFile = new File(jarPath);
        if (!jarFile.exists()) {
            return RpcResponse.error(req.getId(), -32602, "JAR file not found: " + jarPath);
        }

        try {
            if (moduleName == null || moduleName.isEmpty() || version == null || version.isEmpty()) {
                String[] parsed = JarNameParser.parseJarName(jarFile);
                if (moduleName == null || moduleName.isEmpty()) moduleName = parsed[0];
                if (version == null || version.isEmpty()) version = parsed[1];
                if (moduleName == null || moduleName.isEmpty()) {
                    moduleName = jarFile.getName().replaceAll("\\.jar$", "");
                }
                if (version == null || version.isEmpty()) {
                    version = "1.0.0";
                }
            }

            Map<String, List<Asn1TypeInfo>> typesByPackage = JarScanner.scanJarForBerTypes(jarFile);
            if (typesByPackage.isEmpty()) {
                return RpcResponse.error(req.getId(), -32000, "No BerType classes found in JAR");
            }

            Asn1Module module = new Asn1Module(moduleName, version, jarPath, false);
            module.setTypesByPackage(typesByPackage);
            module.setCreateTime(System.currentTimeMillis());

            ModuleManager.getInstance().addModule(module);
            Asn1TypeRegistry.refresh();

            JSONObject result = new JSONObject();
            result.set("moduleId", module.getModuleId());
            result.set("moduleName", moduleName);
            result.set("version", version);
            result.set("typeCount", module.getAllTypes().size());
            return RpcResponse.success(req.getId(), result);

        } catch (Exception e) {
            return RpcResponse.error(req.getId(), -32000, "Import failed: " + e.getMessage());
        }
    }

    public RpcResponse removeModule(RpcRequest req) {
        String moduleId = req.getParams().getStr("moduleId");
        if (moduleId == null || moduleId.isEmpty()) {
            return RpcResponse.error(req.getId(), -32602, "Missing 'moduleId' parameter");
        }

        Asn1Module module = ModuleManager.getInstance().getModule(moduleId);
        if (module != null && module.isBuiltin()) {
            return RpcResponse.error(req.getId(), -32000, "Cannot remove builtin module");
        }

        boolean removed = ModuleManager.getInstance().removeModule(moduleId);
        if (removed) {
            Asn1TypeRegistry.refresh();
        }

        JSONObject result = new JSONObject();
        result.set("removed", removed);
        return RpcResponse.success(req.getId(), result);
    }

    public RpcResponse scanJar(RpcRequest req) {
        String jarPath = req.getParams().getStr("jarPath");
        if (jarPath == null || jarPath.isEmpty()) {
            return RpcResponse.error(req.getId(), -32602, "Missing 'jarPath' parameter");
        }

        File jarFile = new File(jarPath);
        if (!jarFile.exists()) {
            return RpcResponse.error(req.getId(), -32602, "JAR file not found: " + jarPath);
        }

        try {
            Map<String, List<Asn1TypeInfo>> typesByPackage = JarScanner.scanJarForBerTypes(jarFile);
            JSONObject result = new JSONObject();
            int totalTypes = 0;
            JSONArray packages = new JSONArray();

            for (var entry : typesByPackage.entrySet()) {
                JSONObject pkg = new JSONObject();
                pkg.set("package", entry.getKey());
                JSONArray types = new JSONArray();
                for (Asn1TypeInfo t : entry.getValue()) {
                    types.add(t.getSimpleClassName());
                    totalTypes++;
                }
                pkg.set("types", types);
                packages.add(pkg);
            }

            result.set("packages", packages);
            result.set("totalTypes", totalTypes);

            String[] parsed = JarNameParser.parseJarName(jarFile);
            result.set("suggestedName", parsed[0]);
            result.set("suggestedVersion", parsed[1]);

            return RpcResponse.success(req.getId(), result);

        } catch (Exception e) {
            return RpcResponse.error(req.getId(), -32000, "Scan failed: " + e.getMessage());
        }
    }

    public RpcResponse refreshRegistry(RpcRequest req) {
        Asn1TypeRegistry.refresh();
        return RpcResponse.success(req.getId(), true);
    }
}
