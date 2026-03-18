package com.kev17in.asn1viewer.config;

import java.io.File;
import java.util.prefs.Preferences;

/**
 * 应用程序配置管理器
 * 使用 Java Preferences API 持久化配置
 */
public class ConfigManager {
    
    private static final String AUTO_START_KEY = "autoStart";
    private static final String FLOATING_BUTTON_KEY = "floatingButton";
    private static final String FLOATING_BUTTON_X_KEY = "floatingButtonX";
    private static final String FLOATING_BUTTON_Y_KEY = "floatingButtonY";
    private static final String WINDOW_X_KEY = "windowX";
    private static final String WINDOW_Y_KEY = "windowY";
    private static final String WINDOW_WIDTH_KEY = "windowWidth";
    private static final String WINDOW_HEIGHT_KEY = "windowHeight";
    private static final String WINDOW_MAXIMIZED_KEY = "windowMaximized";
    
    private static final Preferences prefs = Preferences.userNodeForPackage(ConfigManager.class);
    
    /**
     * 配置文件存储目录名称
     */
    private static final String CONFIG_DIR_NAME = ".asn1viewer";
    
    // 单例实例
    private static ConfigManager instance;
    
    private ConfigManager() {
    }
    
    public static ConfigManager getInstance() {
        if (instance == null) {
            instance = new ConfigManager();
        }
        return instance;
    }
    
    // ========== 自启动配置 ==========
    
    /**
     * 获取自启动状态
     */
    public boolean isAutoStartEnabled() {
        return prefs.getBoolean(AUTO_START_KEY, false);
    }
    
    /**
     * 设置自启动状态
     */
    public void setAutoStartEnabled(boolean enabled) {
        prefs.putBoolean(AUTO_START_KEY, enabled);
    }
    
    // ========== 悬浮按钮配置 ==========
    
    /**
     * 获取悬浮按钮显示状态
     */
    public boolean isFloatingButtonEnabled() {
        return prefs.getBoolean(FLOATING_BUTTON_KEY, false);
    }
    
    /**
     * 设置悬浮按钮显示状态
     */
    public void setFloatingButtonEnabled(boolean enabled) {
        prefs.putBoolean(FLOATING_BUTTON_KEY, enabled);
    }
    
    /**
     * 获取悬浮按钮 X 坐标
     */
    public double getFloatingButtonX() {
        return prefs.getDouble(FLOATING_BUTTON_X_KEY, -1);
    }
    
    /**
     * 设置悬浮按钮 X 坐标
     */
    public void setFloatingButtonX(double x) {
        prefs.putDouble(FLOATING_BUTTON_X_KEY, x);
    }
    
    /**
     * 获取悬浮按钮 Y 坐标
     */
    public double getFloatingButtonY() {
        return prefs.getDouble(FLOATING_BUTTON_Y_KEY, -1);
    }
    
    /**
     * 设置悬浮按钮 Y 坐标
     */
    public void setFloatingButtonY(double y) {
        prefs.putDouble(FLOATING_BUTTON_Y_KEY, y);
    }
    
    // ========== 窗口位置和大小配置 ==========
    
    /**
     * 获取窗口 X 坐标
     */
    public double getWindowX() {
        return prefs.getDouble(WINDOW_X_KEY, -1);
    }
    
    /**
     * 设置窗口 X 坐标
     */
    public void setWindowX(double x) {
        prefs.putDouble(WINDOW_X_KEY, x);
    }
    
    /**
     * 获取窗口 Y 坐标
     */
    public double getWindowY() {
        return prefs.getDouble(WINDOW_Y_KEY, -1);
    }
    
    /**
     * 设置窗口 Y 坐标
     */
    public void setWindowY(double y) {
        prefs.putDouble(WINDOW_Y_KEY, y);
    }
    
    /**
     * 获取窗口宽度
     */
    public double getWindowWidth() {
        return prefs.getDouble(WINDOW_WIDTH_KEY, 1000);
    }
    
    /**
     * 设置窗口宽度
     */
    public void setWindowWidth(double width) {
        prefs.putDouble(WINDOW_WIDTH_KEY, width);
    }
    
    /**
     * 获取窗口高度
     */
    public double getWindowHeight() {
        return prefs.getDouble(WINDOW_HEIGHT_KEY, 600);  // 从 650 改为 600
    }
    
    /**
     * 设置窗口高度
     */
    public void setWindowHeight(double height) {
        prefs.putDouble(WINDOW_HEIGHT_KEY, height);
    }
    
    /**
     * 获取窗口最大化状态
     */
    public boolean isWindowMaximized() {
        return prefs.getBoolean(WINDOW_MAXIMIZED_KEY, false);
    }
    
    /**
     * 设置窗口最大化状态
     */
    public void setWindowMaximized(boolean maximized) {
        prefs.putBoolean(WINDOW_MAXIMIZED_KEY, maximized);
    }
    
    // ========== 配置文件目录管理 ==========
    
    /**
     * 获取应用配置目录
     * 位置：用户主目录/.asn1viewer/
     */
    public File getConfigDirectory() {
        String userHome = System.getProperty("user.home");
        File configDir = new File(userHome, CONFIG_DIR_NAME);
        if (!configDir.exists()) {
            configDir.mkdirs();
        }
        return configDir;
    }
    
    /**
     * 获取模块配置文件路径
     * 位置：用户主目录/.asn1viewer/modules.json
     */
    public File getModulesConfigFile() {
        return new File(getConfigDirectory(), "modules.json");
    }
}

