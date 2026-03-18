package com.kev17in.asn1viewer.util;

import com.kev17in.asn1viewer.model.Asn1Module;
import com.kev17in.asn1viewer.model.Asn1TypeInfo;
import com.kev17in.asn1viewer.service.JarScanner;
import com.kev17in.asn1viewer.service.ModuleManager;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.util.List;
import java.util.Map;

/**
 * 内置模块初始化器
 * 
 * 自动扫描并加载 libs/ 目录下的所有JAR包作为内置模块
 */
@Slf4j
public class BuiltinModuleInitializer {
    
    /**
     * libs目录的相对路径
     */
    private static final String LIBS_DIR = "libs";
    
    /**
     * 初始化内置模块
     * 
     * 注意：已禁用自动扫描功能
     * 所有模块需要手动导入
     */
    public static void initialize() {
        // 不再自动扫描 libs 目录
        // 用户需要手动导入所有模块
        log.warn("内置模块自动扫描已禁用");
        log.warn("请通过设置界面手动导入 JAR 包");
    }
    
    /**
     * 将JAR包加载为内置模块
     */
    private static void loadJarAsBuiltinModule(File jarFile, ModuleManager moduleManager) {
        try {
            // 从文件名提取模块名和版本
            String[] parsed = JarNameParser.parseJarName(jarFile);
            String moduleName = parsed[0];
            String version = parsed[1];
            
            // 如果没有版本号，使用默认版本
            if (version == null || version.isEmpty()) {
                version = "1.0.0";
            }
            
            String moduleId = moduleName + "@" + version;
            
            // 检查是否已存在
            if (moduleManager.hasModule(moduleId)) {
                log.warn("模块已存在，跳过: {}", moduleId);
                return;
            }

            log.warn("正在扫描: {} ...", jarFile.getName());
            
            // 扫描JAR包中的BerType子类
            Map<String, List<Asn1TypeInfo>> typesByPackage = JarScanner.scanJarForBerTypes(jarFile);
            
            if (typesByPackage.isEmpty()) {
                log.warn("  警告: JAR包中未找到BerType子类");
                return;
            }
            
            int totalTypes = typesByPackage.values().stream()
                    .mapToInt(List::size)
                    .sum();
            
            // 创建内置模块（builtin=true，jarPath指向libs目录中的文件）
            Asn1Module module = new Asn1Module(moduleName, version, jarFile.getAbsolutePath(), true);
            
            // 添加所有类型
            for (Map.Entry<String, List<Asn1TypeInfo>> entry : typesByPackage.entrySet()) {
                module.addTypes(entry.getValue());
            }
            
            // 注册模块
            moduleManager.addModule(module);

            log.warn("  ✓ 成功加载: " + moduleName + " (v" + version + ") - " + 
                             totalTypes + " 个类型，" + typesByPackage.size() + " 个包");
            
        } catch (Exception e) {
            log.error("  ✗ 加载失败: " + jarFile.getName() + " - ",  e);
        }
    }
    
    /**
     * 获取libs目录
     * 尝试多个可能的路径
     */
    private static File getLibsDirectory() {
        // 尝试1: 当前工作目录下的libs
        File libsDir = new File(LIBS_DIR);
        if (libsDir.exists() && libsDir.isDirectory()) {
            log.info("找到libs目录: {}", libsDir.getAbsolutePath());
            return libsDir;
        }
        
        // 尝试2: 用户目录下的.asn1viewer/libs
        String userHome = System.getProperty("user.home");
        libsDir = new File(userHome, ".asn1viewer" + File.separator + LIBS_DIR);
        if (libsDir.exists() && libsDir.isDirectory()) {
            log.info("找到libs目录: {}", libsDir.getAbsolutePath());
            return libsDir;
        }
        
        // 尝试3: JAR包所在目录的libs（适用于打包后的应用）
        try {
            String jarPath = BuiltinModuleInitializer.class.getProtectionDomain()
                    .getCodeSource().getLocation().toURI().getPath();
            File jarFile = new File(jarPath);
            File parentDir = jarFile.getParentFile();
            
            if (parentDir != null) {
                // 如果在lib目录中，尝试上一级的libs
                if (parentDir.getName().equals("lib")) {
                    libsDir = new File(parentDir.getParentFile(), LIBS_DIR);
                    if (libsDir.exists() && libsDir.isDirectory()) {
                        log.info("找到libs目录: {}", libsDir.getAbsolutePath());
                        return libsDir;
                    }
                }
                
                // 尝试同级的libs
                libsDir = new File(parentDir, LIBS_DIR);
                if (libsDir.exists() && libsDir.isDirectory()) {
                    log.info("找到libs目录: {}", libsDir.getAbsolutePath());
                    return libsDir;
                }
            }
        } catch (Exception e) {
            // 忽略异常
            log.error("Exception: ", e);
        }
        
        log.info("未找到libs目录");
        return null;
    }
}
