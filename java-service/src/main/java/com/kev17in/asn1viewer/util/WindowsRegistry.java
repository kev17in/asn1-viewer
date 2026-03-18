package com.kev17in.asn1viewer.util;

import lombok.extern.slf4j.Slf4j;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Windows 注册表操作工具类
 * 用于管理开机自启动等注册表配置
 */
@Slf4j
public class WindowsRegistry {
    
    // 自启动注册表路径
    private static final String AUTO_START_REG_PATH = 
        "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    
    // 应用程序注册表键名
    private static final String APP_REG_KEY = "ASN1Viewer";
    
    /**
     * 检查当前是否为 Windows 系统
     */
    public static boolean isWindows() {
        String os = System.getProperty("os.name").toLowerCase();
        return os.contains("win");
    }
    
    /**
     * 启用开机自启动
     * 
     * @param exePath 可执行文件路径
     * @param hidden 是否后台启动（添加 --hidden 参数）
     * @return 是否操作成功
     */
    @SuppressWarnings("deprecation")
    public static boolean enableAutoStart(String exePath, boolean hidden) {
        if (!isWindows()) {
            log.warn("自启动功能仅支持 Windows 系统");
            return false;
        }
        
        try {
            String value = "\"" + exePath + "\"";
            if (hidden) {
                value += " --hidden";
            }
            
            String command = String.format(
                "reg add \"%s\" /v \"%s\" /t REG_SZ /d \"%s\" /f",
                AUTO_START_REG_PATH,
                APP_REG_KEY,
                value.replace("\"", "\\\"")
            );
            
            Process process = Runtime.getRuntime().exec(command);
            int exitCode = process.waitFor();
            
            if (exitCode == 0) {
                log.info("已启用开机自启动: " + value);
                return true;
            } else {
                log.warn("启用自启动失败，退出码: " + exitCode);
                return false;
            }
        } catch (IOException | InterruptedException e) {
            log.error("启用自启动时发生错误: ", e);
            return false;
        }
    }
    
    /**
     * 禁用开机自启动
     * 
     * @return 是否操作成功
     */
    @SuppressWarnings("deprecation")
    public static boolean disableAutoStart() {
        if (!isWindows()) {
            log.warn("自启动功能仅支持 Windows 系统");
            return false;
        }
        
        try {
            String command = String.format(
                "reg delete \"%s\" /v \"%s\" /f",
                AUTO_START_REG_PATH,
                APP_REG_KEY
            );
            
            Process process = Runtime.getRuntime().exec(command);
            int exitCode = process.waitFor();
            
            if (exitCode == 0) {
                log.info("已禁用开机自启动");
                return true;
            } else {
                // 如果键不存在，删除会失败，但这也算是成功状态
                log.warn("自启动项不存在或已被禁用");
                return true;
            }
        } catch (IOException | InterruptedException e) {
            log.error("禁用自启动时发生错误: ", e);
            return false;
        }
    }
    
    /**
     * 检查是否已启用开机自启动
     * 
     * @return 是否已启用
     */
    @SuppressWarnings("deprecation")
    public static boolean isAutoStartEnabled() {
        if (!isWindows()) {
            return false;
        }
        
        try {
            String command = String.format(
                "reg query \"%s\" /v \"%s\"",
                AUTO_START_REG_PATH,
                APP_REG_KEY
            );
            
            Process process = Runtime.getRuntime().exec(command);
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), "GBK")
            );
            
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains(APP_REG_KEY)) {
                    return true;
                }
            }
            
            reader.close();
            return false;
        } catch (IOException e) {
            log.error("查询自启动状态时发生错误: ", e);
            return false;
        }
    }
    
    /**
     * 获取当前应用程序的可执行文件路径
     * 
     * @return 可执行文件路径，如果无法获取则返回 null
     */
    public static String getExecutablePath() {
        try {
            // 获取 java.home 路径
            String javaHome = System.getProperty("java.home");
            
            // 如果是通过 jpackage 打包的应用，可执行文件在父目录
            // 例如: C:\Program Files\ASN1-Viewer\bin\ASN1-Viewer.exe
            String appImage = System.getProperty("jpackage.app-path");
            if (appImage != null && !appImage.isEmpty()) {
                return appImage;
            }
            
            // 尝试从 java.home 构建路径
            // jpackage 打包后结构: ASN1-Viewer/runtime/bin/java.exe
            // 可执行文件: ASN1-Viewer/ASN1-Viewer.exe
            if (javaHome != null && javaHome.contains("runtime")) {
                String appDir = javaHome.substring(0, javaHome.indexOf("runtime"));
                String exePath = appDir + "ASN1-Viewer.exe";
                return exePath;
            }
            
            // 如果都无法获取，返回当前 jar 路径（开发环境）
            String jarPath = WindowsRegistry.class
                .getProtectionDomain()
                .getCodeSource()
                .getLocation()
                .getPath();
            
            if (jarPath.startsWith("/")) {
                jarPath = jarPath.substring(1);
            }
            
            return jarPath;
        } catch (Exception e) {
            log.error("获取可执行文件路径时发生错误: ", e);
            return null;
        }
    }
}

