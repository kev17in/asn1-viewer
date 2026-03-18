package com.kev17in.asn1viewer.service;

import com.beanit.asn1bean.ber.types.BerType;
import com.kev17in.asn1viewer.model.Asn1Module;
import com.kev17in.asn1viewer.model.Asn1TypeInfo;
import com.kev17in.asn1viewer.util.BuiltinModuleInitializer;

import java.util.*;
import java.util.function.Supplier;

/**
 * ASN.1 类型注册表
 * 从ModuleManager动态获取所有可用的ASN.1类型
 */
public class Asn1TypeRegistry {
    
    private static boolean initialized = false;
    
    /**
     * 初始化注册表
     * 确保内置模块已加载
     */
    private static void ensureInitialized() {
        if (!initialized) {
            synchronized (Asn1TypeRegistry.class) {
                if (!initialized) {
                    BuiltinModuleInitializer.initialize();
                    initialized = true;
                }
            }
        }
    }
    
    /**
     * 获取所有已注册的类型名称（三级层级结构）
     * 格式:
     * - 模块名（无缩进）
     * -   v版本（2空格缩进）
     * -     类型名（4空格缩进）
     * 
     * @return 类型显示名称列表
     */
    public static List<String> getTypeNames() {
        ensureInitialized();
        
        ModuleManager moduleManager = ModuleManager.getInstance();
        List<String> typeNames = new ArrayList<>();
        
        // 按模块名分组
        Map<String, Map<String, List<Asn1TypeInfo>>> groupedModules = new LinkedHashMap<>();
        
        for (Asn1Module module : moduleManager.getAllModules()) {
            String moduleName = module.getModuleName();
            String version = module.getVersion();
            
            groupedModules
                .computeIfAbsent(moduleName, k -> new LinkedHashMap<>())
                .put(version, module.getAllTypes());
        }
        
        // 构建三级层级列表
        for (Map.Entry<String, Map<String, List<Asn1TypeInfo>>> moduleEntry : groupedModules.entrySet()) {
            String moduleName = moduleEntry.getKey();
            
            // 第一级：模块名（无缩进）
            typeNames.add(moduleName);
            
            for (Map.Entry<String, List<Asn1TypeInfo>> versionEntry : moduleEntry.getValue().entrySet()) {
                String version = versionEntry.getKey();
                List<Asn1TypeInfo> types = versionEntry.getValue();
                
                // 第二级：版本号（2空格缩进）
                typeNames.add("  v" + version);
                
                // 第三级：类型名（4空格缩进）
                // 去重，同一类型可能在多个包中
                Set<String> addedTypes = new HashSet<>();
                for (Asn1TypeInfo type : types) {
                    String simpleClassName = type.getSimpleClassName();
                    if (addedTypes.add(simpleClassName)) {
                        typeNames.add("    " + simpleClassName);
                    }
                }
            }
        }
        
        return typeNames;
    }
    
    /**
     * 根据显示名称获取类型的Supplier
     * 支持两种格式:
     * 1. 旧格式: 模块名 (v版本) > 包名 > 类名
     * 2. 新格式: "    类型名"（4空格缩进）配合完整上下文
     * 
     * @param displayName 类型显示名称
     * @return BerType实例的Supplier，如果找不到则返回null
     */
    @SuppressWarnings("unchecked")
    public static <T extends BerType> Supplier<T> getSupplier(String displayName) {
        ensureInitialized();
        
        // 解析显示名称
        TypeReference ref = parseDisplayName(displayName);
        if (ref == null) {
            return null;
        }
        
        ModuleManager moduleManager = ModuleManager.getInstance();
        Asn1Module module = moduleManager.getModule(ref.moduleId);
        
        if (module == null) {
            return null;
        }
        
        // 在模块中查找完整类名
        String fullClassName = findFullClassName(module, ref.simpleClassName);
        if (fullClassName == null) {
            return null;
        }
        
        return moduleManager.getTypeSupplier(ref.moduleId, fullClassName);
    }
    
    /**
     * 根据显示名称获取类型的Supplier，需要提供完整的层级上下文
     * 用于三级联动场景
     * 
     * @param moduleName 模块名
     * @param version 版本号
     * @param simpleClassName 简单类名
     * @return BerType实例的Supplier，如果找不到则返回null
     */
    @SuppressWarnings("unchecked")
    public static <T extends BerType> Supplier<T> getSupplier(String moduleName, String version, String simpleClassName) {
        ensureInitialized();
        
        String moduleId = moduleName + "@" + version;
        ModuleManager moduleManager = ModuleManager.getInstance();
        Asn1Module module = moduleManager.getModule(moduleId);
        
        if (module == null) {
            return null;
        }
        
        // 在模块中查找完整类名
        String fullClassName = findFullClassName(module, simpleClassName);
        if (fullClassName == null) {
            return null;
        }
        
        return moduleManager.getTypeSupplier(moduleId, fullClassName);
    }
    
    /**
     * 检查类型是否存在
     * 支持两种格式验证
     * 
     * @param displayName 类型显示名称
     * @return 如果类型存在则返回true
     */
    public static boolean hasType(String displayName) {
        // 对于三级层级格式，只有第三级（类型名）才是有效类型
        if (isTypeName(displayName)) {
            return getSupplier(displayName) != null;
        }
        return false;
    }
    
    /**
     * 判断显示名称是否为模块名（第一级，无缩进）
     */
    public static boolean isModuleName(String displayName) {
        return displayName != null && !displayName.startsWith(" ");
    }
    
    /**
     * 判断显示名称是否为版本号（第二级，2空格缩进 + "v"）
     */
    public static boolean isVersionName(String displayName) {
        return displayName != null && displayName.startsWith("  v") && !displayName.startsWith("   ");
    }
    
    /**
     * 判断显示名称是否为类型名（第三级，4空格缩进）
     */
    public static boolean isTypeName(String displayName) {
        return displayName != null && displayName.startsWith("    ") && !displayName.startsWith("     ");
    }
    
    /**
     * 获取显示名称的层级
     * @return 1=模块名, 2=版本号, 3=类型名, 0=无效
     */
    public static int getDisplayNameLevel(String displayName) {
        if (isTypeName(displayName)) return 3;
        if (isVersionName(displayName)) return 2;
        if (isModuleName(displayName)) return 1;
        return 0;
    }
    
    /**
     * 获取默认显示的类型名称列表
     * 主要显示SGP.32相关的常用类型
     * 
     * @return 默认类型名称列表
     */
    public static List<String> getDefaultTypeNames() {
        ensureInitialized();
        
        List<String> allTypes = getTypeNames();
        List<String> defaultTypes = new ArrayList<>();
        
        // 过滤出SGP.32模块中的常用类型
        String[] preferredTypes = {
            "InitiateAuthenticationRequestEsipa",
            "AuthenticateClientRequestEsipa",
            "GetBoundProfilePackageRequestEsipa",
            "CancelSessionRequestEsipa",
            "HandleNotificationEsipa",
            "TransferEimPackageResponse",
            "GetEimPackageRequest",
            "ProvideEimPackageResult",
            "EsipaMessageFromIpaToEim",
            "EsipaMessageFromEimToIpa",
            "InitiateAuthenticationResponseEsipa",
            "AuthenticateClientResponseEsipa",
            "GetBoundProfilePackageResponseEsipa",
            "CancelSessionResponseEsipa",
            "TransferEimPackageRequest",
            "GetEimPackageResponse",
            "ProvideEimPackageResultResponse"
        };
        
        for (String typeName : allTypes) {
            for (String preferred : preferredTypes) {
                if (typeName.endsWith(preferred)) {
                    defaultTypes.add(typeName);
                    break;
                }
            }
        }
        
        // 如果没有SGP.32类型，返回所有类型的前20个
        if (defaultTypes.isEmpty() && !allTypes.isEmpty()) {
            int limit = Math.min(20, allTypes.size());
            defaultTypes.addAll(allTypes.subList(0, limit));
        }
        
        return defaultTypes;
    }
    
    /**
     * 检查是否为默认类型
     * 
     * @param displayName 类型显示名称
     * @return 如果是默认类型则返回true
     */
    public static boolean isDefaultType(String displayName) {
        return getDefaultTypeNames().contains(displayName);
    }
    
    /**
     * 刷新注册表（重新加载所有模块）
     */
    public static void refresh() {
        initialized = false;
        ensureInitialized();
    }
    
    /**
     * 解析显示名称，提取模块信息和类名
     * 支持三种格式:
     * 1. 旧格式: "模块名 (v版本) > 包名 > 类名"
     * 2. 新格式（带后缀）: "类型名 (模块名/版本)"
     * 3. 新格式（不带后缀）: "    类型名"（需要配合上下文从完整列表中查找）
     */
    private static TypeReference parseDisplayName(String displayName) {
        try {
            // 检测是否为旧格式（包含" > "）
            if (displayName.contains(" > ")) {
                return parseOldFormat(displayName);
            }
            
            String trimmed = displayName.trim();
            
            // 检查是否为带后缀的新格式 "ClassName (Module/Version)"
            if (trimmed.contains(" (") && trimmed.endsWith(")")) {
                int parenIndex = trimmed.indexOf(" (");
                String className = trimmed.substring(0, parenIndex);
                String pathInfo = trimmed.substring(parenIndex + 2, trimmed.length() - 1);
                
                // 解析 Module/Version
                String[] pathParts = pathInfo.split("/");
                if (pathParts.length == 2) {
                    String moduleName = pathParts[0];
                    String version = pathParts[1];
                    String moduleId = moduleName + "@" + version;
                    return new TypeReference(moduleId, className);
                }
            }
            
            // 不带后缀的格式：需要遍历所有模块查找
            ModuleManager moduleManager = ModuleManager.getInstance();
            for (Asn1Module module : moduleManager.getAllModules()) {
                String fullClassName = findFullClassName(module, trimmed);
                if (fullClassName != null) {
                    return new TypeReference(module.getModuleId(), trimmed);
                }
            }
            
            return null;
        } catch (Exception e) {
            return null;
        }
    }
    
    /**
     * 解析旧格式的显示名称
     * 格式: 模块名 (v版本) > 包名 > 类名
     */
    private static TypeReference parseOldFormat(String displayName) {
        try {
            String[] parts = displayName.split(" > ");
            if (parts.length < 2) {
                return null;
            }
            
            // 解析模块名和版本
            String moduleInfo = parts[0].trim();
            int versionStart = moduleInfo.lastIndexOf("(v");
            if (versionStart < 0) {
                return null;
            }
            
            String moduleName = moduleInfo.substring(0, versionStart).trim();
            String version = moduleInfo.substring(versionStart + 2, moduleInfo.length() - 1);
            String moduleId = moduleName + "@" + version;
            
            // 获取类名（最后一部分）
            String simpleClassName = parts[parts.length - 1].trim();
            
            return new TypeReference(moduleId, simpleClassName);
        } catch (Exception e) {
            return null;
        }
    }
    
    /**
     * 在模块中查找简单类名对应的完整类名
     */
    private static String findFullClassName(Asn1Module module, String simpleClassName) {
        for (Asn1TypeInfo type : module.getAllTypes()) {
            if (type.getSimpleClassName().equals(simpleClassName)) {
                return type.getFullClassName();
            }
        }
        return null;
    }
    
    /**
     * 类型引用内部类
     */
    private static class TypeReference {
        final String moduleId;
        final String simpleClassName;
        
        TypeReference(String moduleId, String simpleClassName) {
            this.moduleId = moduleId;
            this.simpleClassName = simpleClassName;
        }
    }
}
