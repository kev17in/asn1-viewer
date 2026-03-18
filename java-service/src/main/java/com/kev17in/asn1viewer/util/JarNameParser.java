package com.kev17in.asn1viewer.util;

import java.io.File;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * JAR文件名解析工具
 * 从JAR文件名中提取模块名和版本号
 */
public class JarNameParser {
    
    // 匹配版本号的正则表达式
    // 支持格式: 1.0, 1.0.0, 1.0.0-SNAPSHOT, v1.0.0, etc.
    private static final Pattern VERSION_PATTERN = Pattern.compile(
        "[-_]?v?(\\d+\\.\\d+(?:\\.\\d+)?(?:[-._]?(?:SNAPSHOT|RELEASE|RC\\d+|ALPHA|BETA|FINAL))?)",
        Pattern.CASE_INSENSITIVE
    );
    
    /**
     * 从JAR文件中提取模块名和版本
     * 
     * @param jarFile JAR文件
     * @return 包含模块名和版本的数组 [moduleName, version]
     */
    public static String[] parseJarName(File jarFile) {
        String fileName = jarFile.getName();
        
        // 移除.jar扩展名
        if (fileName.endsWith(".jar")) {
            fileName = fileName.substring(0, fileName.length() - 4);
        }
        
        String moduleName = fileName;
        String version = "";
        
        // 尝试提取版本号
        Matcher matcher = VERSION_PATTERN.matcher(fileName);
        if (matcher.find()) {
            version = matcher.group(1);
            // 移除版本号部分，得到模块名
            moduleName = fileName.substring(0, matcher.start());
            // 清理模块名末尾的分隔符
            moduleName = moduleName.replaceAll("[-_]+$", "");
        }
        
        // 清理模块名：将下划线和连字符转换为空格，并进行首字母大写
        moduleName = formatModuleName(moduleName);
        
        return new String[]{moduleName, version};
    }
    
    /**
     * 格式化模块名
     * 将下划线和连字符转换为空格，并进行适当的大小写处理
     * 
     * @param name 原始模块名
     * @return 格式化后的模块名
     */
    private static String formatModuleName(String name) {
        if (name == null || name.isEmpty()) {
            return "Unknown Module";
        }
        
        // 替换下划线和连字符为空格
        name = name.replace('_', ' ').replace('-', ' ');
        
        // 分割单词并进行首字母大写
        String[] words = name.split("\\s+");
        StringBuilder result = new StringBuilder();
        
        for (String word : words) {
            if (!word.isEmpty()) {
                if (result.length() > 0) {
                    result.append(" ");
                }
                // 首字母大写，其余保持原样（可能是驼峰命名）
                result.append(Character.toUpperCase(word.charAt(0)));
                if (word.length() > 1) {
                    result.append(word.substring(1));
                }
            }
        }
        
        return result.toString();
    }
    
    /**
     * 从JAR文件提取模块名
     * 
     * @param jarFile JAR文件
     * @return 模块名
     */
    public static String extractModuleName(File jarFile) {
        return parseJarName(jarFile)[0];
    }
    
    /**
     * 从JAR文件提取版本号
     * 
     * @param jarFile JAR文件
     * @return 版本号，如果未找到则返回空字符串
     */
    public static String extractVersion(File jarFile) {
        return parseJarName(jarFile)[1];
    }
}
