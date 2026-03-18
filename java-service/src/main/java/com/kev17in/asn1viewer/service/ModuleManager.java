package com.kev17in.asn1viewer.service;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.beanit.asn1bean.ber.types.BerType;
import com.kev17in.asn1viewer.config.ConfigManager;
import com.kev17in.asn1viewer.model.Asn1Module;
import com.kev17in.asn1viewer.model.Asn1TypeInfo;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * 模块管理器
 * 管理所有已导入的ASN.1模块，提供模块的增删查改功能
 */
@Slf4j
public class ModuleManager {
    
    private static ModuleManager instance;
    
    /**
     * 所有已加载的模块
     * Key: 模块ID (模块名@版本)
     */
    private final Map<String, Asn1Module> modules = new ConcurrentHashMap<>();
    
    /**
     * 每个模块的ClassLoader
     * Key: 模块ID
     */
    private final Map<String, ClassLoader> moduleClassLoaders = new ConcurrentHashMap<>();
    
    private final ConfigManager configManager;
    
    private ModuleManager() {
        this.configManager = ConfigManager.getInstance();
        loadModulesFromConfig();
    }
    
    public static synchronized ModuleManager getInstance() {
        if (instance == null) {
            instance = new ModuleManager();
        }
        return instance;
    }
    
    /**
     * 添加模块
     * 
     * @param module 模块信息
     * @throws IllegalArgumentException 如果模块ID已存在
     */
    public synchronized void addModule(Asn1Module module) {
        String moduleId = module.getModuleId();
        
        if (modules.containsKey(moduleId)) {
            throw new IllegalArgumentException("模块 " + moduleId + " 已存在");
        }
        
        modules.put(moduleId, module);
        
        // 为非内置模块创建ClassLoader
        if (!module.isBuiltin() && module.getJarPath() != null) {
            try {
                File jarFile = new File(module.getJarPath());
                URL jarUrl = jarFile.toURI().toURL();
                // 使用当前线程的上下文类加载器作为父加载器
                // 这样外部JAR可以访问应用程序的所有依赖
                ClassLoader parentLoader = Thread.currentThread().getContextClassLoader();
                if (parentLoader == null) {
                    parentLoader = ModuleManager.class.getClassLoader();
                }
                URLClassLoader classLoader = new URLClassLoader(
                        new URL[]{jarUrl},
                        parentLoader
                );
                moduleClassLoaders.put(moduleId, classLoader);
            } catch (Exception e) {
                log.error("无法为模块 " + moduleId + " 创建ClassLoader: ",  e);
            }
        } else {
            // 内置模块使用当前ClassLoader
            moduleClassLoaders.put(moduleId, ModuleManager.class.getClassLoader());
        }
        
        saveModulesToConfig();
    }
    
    /**
     * 删除模块
     * 
     * @param moduleId 模块ID
     * @return 如果模块存在并成功删除则返回true
     */
    public synchronized boolean removeModule(String moduleId) {
        Asn1Module module = modules.remove(moduleId);
        
        if (module != null) {
            // 关闭ClassLoader
            ClassLoader classLoader = moduleClassLoaders.remove(moduleId);
            if (classLoader instanceof URLClassLoader) {
                try {
                    ((URLClassLoader) classLoader).close();
                } catch (IOException e) {
                    log.error("关闭ClassLoader失败: ", e);
                }
            }
            
            saveModulesToConfig();
            return true;
        }
        
        return false;
    }
    
    /**
     * 获取模块
     * 
     * @param moduleId 模块ID
     * @return 模块信息，如果不存在则返回null
     */
    public Asn1Module getModule(String moduleId) {
        return modules.get(moduleId);
    }
    
    /**
     * 获取所有模块
     * 
     * @return 模块列表
     */
    public List<Asn1Module> getAllModules() {
        return new ArrayList<>(modules.values());
    }
    
    /**
     * 检查模块是否存在
     * 
     * @param moduleId 模块ID
     * @return 如果存在返回true
     */
    public boolean hasModule(String moduleId) {
        return modules.containsKey(moduleId);
    }
    
    /**
     * 根据完全限定类名和模块ID创建类型实例
     * 
     * @param moduleId 模块ID
     * @param fullClassName 完全限定类名
     * @return BerType实例的Supplier
     */
    @SuppressWarnings("unchecked")
    public <T extends BerType> Supplier<T> getTypeSupplier(String moduleId, String fullClassName) {
        ClassLoader classLoader = moduleClassLoaders.get(moduleId);
        
        if (classLoader == null) {
            throw new IllegalStateException("模块 " + moduleId + " 的ClassLoader不存在");
        }
        
        return () -> {
            try {
                Class<?> clazz = classLoader.loadClass(fullClassName);
                return (T) clazz.getDeclaredConstructor().newInstance();
            } catch (Exception e) {
                throw new RuntimeException("无法创建类型实例: " + fullClassName, e);
            }
        };
    }
    
    /**
     * 验证模块名和版本的唯一性
     * 
     * @param moduleName 模块名
     * @param version 版本
     * @return 如果已存在相同模块ID则返回false
     */
    public boolean validateModuleUniqueness(String moduleName, String version) {
        String moduleId = moduleName + "@" + version;
        return !modules.containsKey(moduleId);
    }
    
    /**
     * 从配置文件加载模块
     */
    private void loadModulesFromConfig() {
        File configFile = configManager.getModulesConfigFile();
        
        if (!configFile.exists()) {
            return;
        }
        
        try {
            String content = Files.readString(configFile.toPath(), StandardCharsets.UTF_8);
            JSONObject json = JSONUtil.parseObj(content);
            JSONArray modulesArray = json.getJSONArray("modules");
            
            if (modulesArray != null) {
                for (int i = 0; i < modulesArray.size(); i++) {
                    JSONObject moduleJson = modulesArray.getJSONObject(i);
                    Asn1Module module = parseModuleFromJson(moduleJson);
                    
                    if (module != null) {
                        modules.put(module.getModuleId(), module);
                        
                        // 创建ClassLoader
                        if (!module.isBuiltin() && module.getJarPath() != null) {
                            try {
                                File jarFile = new File(module.getJarPath());
                                if (jarFile.exists()) {
                                    URL jarUrl = jarFile.toURI().toURL();
                                    // 使用当前线程的上下文类加载器作为父加载器
                                    ClassLoader parentLoader = Thread.currentThread().getContextClassLoader();
                                    if (parentLoader == null) {
                                        parentLoader = ModuleManager.class.getClassLoader();
                                    }
                                    URLClassLoader classLoader = new URLClassLoader(
                                            new URL[]{jarUrl},
                                            parentLoader
                                    );
                                    moduleClassLoaders.put(module.getModuleId(), classLoader);
                                } else {
                                    log.warn("JAR文件不存在: {}", module.getJarPath());
                                }
                            } catch (Exception e) {
                                log.error("无法加载模块 " + module.getModuleId() + ": ", e);
                            }
                        } else {
                            moduleClassLoaders.put(module.getModuleId(), ModuleManager.class.getClassLoader());
                        }
                    }
                }
            }
        } catch (Exception e) {
           log.error("加载模块配置失败: ", e);
        }
    }
    
    /**
     * 保存模块到配置文件
     */
    private void saveModulesToConfig() {
        File configFile = configManager.getModulesConfigFile();
        
        try {
            JSONObject json = new JSONObject();
            JSONArray modulesArray = new JSONArray();
            
            for (Asn1Module module : modules.values()) {
                JSONObject moduleJson = convertModuleToJson(module);
                modulesArray.add(moduleJson);
            }
            
            json.set("modules", modulesArray);
            json.set("lastUpdated", System.currentTimeMillis());
            
            String content = JSONUtil.toJsonPrettyStr(json);
            Files.writeString(configFile.toPath(), content, StandardCharsets.UTF_8);
            
        } catch (Exception e) {
            log.error("保存模块配置失败: ", e);
        }
    }
    
    /**
     * 将模块对象转换为JSON
     */
    private JSONObject convertModuleToJson(Asn1Module module) {
        JSONObject json = new JSONObject();
        json.set("moduleName", module.getModuleName());
        json.set("version", module.getVersion());
        json.set("jarPath", module.getJarPath());
        json.set("builtin", module.isBuiltin());
        json.set("createTime", module.getCreateTime());
        
        // 保存类型信息（按包名分组）
        JSONObject typesByPackageJson = new JSONObject();
        for (Map.Entry<String, List<Asn1TypeInfo>> entry : module.getTypesByPackage().entrySet()) {
            String packageName = entry.getKey();
            List<Asn1TypeInfo> types = entry.getValue();
            
            JSONArray typesArray = new JSONArray();
            for (Asn1TypeInfo type : types) {
                JSONObject typeJson = new JSONObject();
                typeJson.set("fullClassName", type.getFullClassName());
                typeJson.set("simpleClassName", type.getSimpleClassName());
                typeJson.set("packageName", type.getPackageName());
                typesArray.add(typeJson);
            }
            
            typesByPackageJson.set(packageName, typesArray);
        }
        json.set("typesByPackage", typesByPackageJson);
        
        return json;
    }
    
    /**
     * 从JSON解析模块对象
     */
    private Asn1Module parseModuleFromJson(JSONObject json) {
        try {
            String moduleName = json.getStr("moduleName");
            String version = json.getStr("version");
            String jarPath = json.getStr("jarPath");
            boolean builtin = json.getBool("builtin", false);
            long createTime = json.getLong("createTime", System.currentTimeMillis());
            
            Asn1Module module = new Asn1Module(moduleName, version, jarPath, builtin);
            module.setCreateTime(createTime);
            
            // 解析类型信息
            JSONObject typesByPackageJson = json.getJSONObject("typesByPackage");
            if (typesByPackageJson != null) {
                Map<String, List<Asn1TypeInfo>> typesByPackage = new LinkedHashMap<>();
                
                for (String packageName : typesByPackageJson.keySet()) {
                    JSONArray typesArray = typesByPackageJson.getJSONArray(packageName);
                    List<Asn1TypeInfo> types = new ArrayList<>();
                    
                    for (int i = 0; i < typesArray.size(); i++) {
                        JSONObject typeJson = typesArray.getJSONObject(i);
                        String fullClassName = typeJson.getStr("fullClassName");
                        String simpleClassName = typeJson.getStr("simpleClassName");
                        String pkgName = typeJson.getStr("packageName");
                        
                        Asn1TypeInfo typeInfo = new Asn1TypeInfo(fullClassName, simpleClassName, pkgName);
                        types.add(typeInfo);
                    }
                    
                    typesByPackage.put(packageName, types);
                }
                
                module.setTypesByPackage(typesByPackage);
            }
            
            return module;
        } catch (Exception e) {
            log.error("解析模块JSON失败: ", e);
            return null;
        }
    }
    
    /**
     * 清空所有模块（仅用于测试）
     */
    public synchronized void clearAllModules() {
        for (ClassLoader classLoader : moduleClassLoaders.values()) {
            if (classLoader instanceof URLClassLoader) {
                try {
                    ((URLClassLoader) classLoader).close();
                } catch (IOException e) {
                    log.error("关闭 ClassLoader 失败", e);
                }
            }
        }
        modules.clear();
        moduleClassLoaders.clear();
        saveModulesToConfig();
    }
}
