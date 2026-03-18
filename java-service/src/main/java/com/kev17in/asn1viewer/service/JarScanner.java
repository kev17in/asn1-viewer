package com.kev17in.asn1viewer.service;

import com.kev17in.asn1viewer.model.Asn1TypeInfo;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.*;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * JAR包扫描器
 * 扫描JAR包中所有实现BerType接口的类
 */
@Slf4j
public class JarScanner {
    
    /**
     * BerType 接口的全限定名
     */
    private static final String BERTYPE_INTERFACE_NAME = "com.beanit.asn1bean.ber.types.BerType";
    
    /**
     * 检查类是否实现了 BerType 接口
     * 通过接口名称字符串比较,避免类加载器隔离导致的 isAssignableFrom 失败
     * 
     * @param clazz 要检查的类
     * @return 如果实现了 BerType 接口返回 true
     */
    private static boolean implementsBerType(Class<?> clazz) {
        return implementsBerType(clazz, 0);
    }
    
    /**
     * 检查类是否实现了 BerType 接口（带深度追踪）
     */
    private static boolean implementsBerType(Class<?> clazz, int depth) {
        if (clazz == null || clazz.equals(Object.class)) {
            return false;
        }
        
        String indent = "    ".repeat(depth);
        
        // 检查直接实现的接口
        for (Class<?> iface : clazz.getInterfaces()) {
            if (depth < 3) {
                log.debug("{}  检查接口: {}", indent, iface.getName());
            }
            
            if (BERTYPE_INTERFACE_NAME.equals(iface.getName())) {
                log.debug("{}  ✓ 找到 BerType 接口!", indent);
                return true;
            }
            
            // 递归检查接口的父接口
            if (implementsBerType(iface, depth + 1)) {
                return true;
            }
        }
        
        // 递归检查父类
        Class<?> superClass = clazz.getSuperclass();
        if (superClass != null && !superClass.equals(Object.class)) {
            if (depth < 3) {
                log.debug("{}  检查父类: {}", indent, superClass.getName());
            }
            return implementsBerType(superClass, depth + 1);
        }
        
        return false;
    }
    
    /**
     * 扫描JAR包，提取所有BerType子类
     * 
     * @param jarFile JAR文件
     * @return 按包名分组的类型信息列表
     * @throws IOException 如果读取JAR文件失败
     */
    public static Map<String, List<Asn1TypeInfo>> scanJarForBerTypes(File jarFile) throws IOException {
        Map<String, List<Asn1TypeInfo>> typesByPackage = new LinkedHashMap<>();
        
        log.info("=== 开始扫描 JAR 包 ===");
        log.info("JAR 文件: {}", jarFile.getAbsolutePath());
        log.info("文件大小: {} 字节", jarFile.length());
        
        // 创建URLClassLoader加载JAR，使用当前线程的上下文类加载器作为父加载器
        // 这样可以访问应用程序的所有依赖（如slf4j等）
        URL jarUrl = jarFile.toURI().toURL();
        ClassLoader parentLoader = Thread.currentThread().getContextClassLoader();
        if (parentLoader == null) {
            parentLoader = JarScanner.class.getClassLoader();
        }
        log.debug("父类加载器: {}", parentLoader.getClass().getName());
        
        URLClassLoader classLoader = new URLClassLoader(new URL[]{jarUrl}, parentLoader);
        
        int totalClasses = 0;
        int berTypeClasses = 0;
        
        try (JarFile jar = new JarFile(jarFile)) {
            Enumeration<JarEntry> entries = jar.entries();
            
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                String name = entry.getName();
                
                // 只处理.class文件
                if (!name.endsWith(".class")) {
                    continue;
                }
                
                totalClasses++;
                
                // 转换为类名
                String className = name.substring(0, name.length() - 6)
                        .replace('/', '.');
                
                try {
                    // 加载类
                    Class<?> clazz = classLoader.loadClass(className);
                    
                    if (totalClasses <= 10) {
                        log.debug("  [{}] 检查类: {}", totalClasses, className);
                    }
                    
                    // 检查是否实现了BerType接口
                    boolean isBerType = implementsBerType(clazz);
                    boolean isInterface = clazz.isInterface();
                    boolean isAbstract = java.lang.reflect.Modifier.isAbstract(clazz.getModifiers());
                    boolean isBerTypeItself = className.equals("com.beanit.asn1bean.ber.types.BerType");
                    
                    if (isBerType && totalClasses <= 50) {
                        log.debug("    -> 实现了 BerType 接口: {} (接口:{}, 抽象:{})", 
                                clazz.getSimpleName(), isInterface, isAbstract);
                    }
                    
                    // 排除接口本身和抽象类
                    // 注意: 在jpackage打包后，由于类加载器隔离，不能直接使用 isAssignableFrom
                    // 需要通过接口名称字符串来判断
                    if (isBerType && !isInterface && !isAbstract && !isBerTypeItself) {
                        
                        // 验证是否有可访问的无参构造函数，并且能够成功实例化
                        try {
                            var constructor = clazz.getDeclaredConstructor();
                            // 尝试创建实例以验证构造函数是否可用
                            // 这可以提前发现无法实例化的类型，避免在运行时出错
                            constructor.setAccessible(true);
                            constructor.newInstance();
                            
                            berTypeClasses++;
                            log.info("  ✓ 找到有效的 BerType 类 [{}]: {}", berTypeClasses, clazz.getSimpleName());
                            
                            // 创建类型信息
                            Asn1TypeInfo typeInfo = new Asn1TypeInfo(className);
                            
                            // 按包名分组
                            String packageName = typeInfo.getPackageName();
                            typesByPackage.computeIfAbsent(packageName, k -> new ArrayList<>()).add(typeInfo);
                        } catch (NoSuchMethodException e) {
                            // 没有无参构造函数，跳过
                            log.debug("  跳过 {}: 没有无参构造函数", clazz.getSimpleName());
                        } catch (InstantiationException | IllegalAccessException e) {
                            // 无法实例化，跳过
                            log.debug("  跳过 {}: 无法实例化 - {}", clazz.getSimpleName(), e.getMessage());
                        } catch (Exception e) {
                            // 其他异常，跳过（通常是构造函数内部抛出的异常）
                            log.debug("  跳过 {}: {}: {}", clazz.getSimpleName(), 
                                    e.getClass().getSimpleName(), 
                                    e.getMessage() != null ? e.getMessage() : "构造函数执行失败");
                        }
                    }
                } catch (UnsupportedClassVersionError e) {
                    // 跳过Java版本不兼容的类
                    log.debug("  ✗ 类版本不兼容，跳过: {}", className);
                } catch (ClassNotFoundException e) {
                    log.debug("  ✗ 找不到类: {} - {}", className, e.getMessage());
                } catch (NoClassDefFoundError e) {
                    log.debug("  ✗ 类定义错误: {} - {}", className, e.getMessage());
                } catch (UnsatisfiedLinkError e) {
                    log.debug("  ✗ 本地库链接错误: {}", className);
                } catch (Exception e) {
                    log.debug("  ✗ 处理类时出错: {} - {}: {}", className, 
                            e.getClass().getSimpleName(), e.getMessage());
                }
            }
        } finally {
            // 关闭ClassLoader
            try {
                classLoader.close();
            } catch (IOException e) {
                log.error("关闭 ClassLoader 失败", e);
            }
        }
        
        log.info("=== 扫描完成 ===");
        log.info("总共检查的类: {}", totalClasses);
        log.info("找到的 BerType 子类: {}", berTypeClasses);
        log.info("按包分组数: {}", typesByPackage.size());
        
        return typesByPackage;
    }
    
    /**
     * 扫描JAR包，返回扁平的类型列表
     * 
     * @param jarFile JAR文件
     * @return 类型信息列表
     * @throws IOException 如果读取JAR文件失败
     */
    public static List<Asn1TypeInfo> scanJarForBerTypesList(File jarFile) throws IOException {
        Map<String, List<Asn1TypeInfo>> typesByPackage = scanJarForBerTypes(jarFile);
        List<Asn1TypeInfo> allTypes = new ArrayList<>();
        for (List<Asn1TypeInfo> types : typesByPackage.values()) {
            allTypes.addAll(types);
        }
        return allTypes;
    }
    
    /**
     * 获取JAR包中BerType子类的数量
     * 
     * @param jarFile JAR文件
     * @return 类型数量
     * @throws IOException 如果读取JAR文件失败
     */
    public static int countBerTypes(File jarFile) throws IOException {
        return scanJarForBerTypesList(jarFile).size();
    }
    
    /**
     * 验证JAR包是否包含BerType子类
     * 
     * @param jarFile JAR文件
     * @return 如果包含至少一个BerType子类则返回true
     * @throws IOException 如果读取JAR文件失败
     */
    public static boolean containsBerTypes(File jarFile) throws IOException {
        return countBerTypes(jarFile) > 0;
    }
}
