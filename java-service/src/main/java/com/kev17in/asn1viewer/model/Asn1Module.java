package com.kev17in.asn1viewer.model;

import java.io.Serializable;
import java.util.*;

/**
 * ASN.1 模块信息
 * 代表一个已导入的ASN.1类型定义模块（可以是JAR包或内置模块）
 */
public class Asn1Module implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 模块名称（用户自定义）
     */
    private String moduleName;
    
    /**
     * 模块版本
     */
    private String version;
    
    /**
     * JAR包路径（如果是外部JAR）
     * 内置模块该字段为null
     */
    private String jarPath;
    
    /**
     * 是否为内置模块
     */
    private boolean builtin;
    
    /**
     * 该模块包含的所有ASN.1类型
     * 按包名分组：Map<包名, List<类型信息>>
     */
    private Map<String, List<Asn1TypeInfo>> typesByPackage;
    
    /**
     * 模块创建时间
     */
    private long createTime;
    
    public Asn1Module() {
        this.typesByPackage = new LinkedHashMap<>();
        this.createTime = System.currentTimeMillis();
    }
    
    public Asn1Module(String moduleName, String version, String jarPath, boolean builtin) {
        this();
        this.moduleName = moduleName;
        this.version = version;
        this.jarPath = jarPath;
        this.builtin = builtin;
    }
    
    /**
     * 获取模块的唯一标识符
     * 格式: 模块名@版本
     */
    public String getModuleId() {
        return moduleName + "@" + version;
    }
    
    /**
     * 获取模块的显示名称
     * 格式: 模块名 (v版本)
     */
    public String getDisplayName() {
        return moduleName + " (v" + version + ")";
    }
    
    /**
     * 添加类型信息
     */
    public void addType(Asn1TypeInfo typeInfo) {
        String packageName = typeInfo.getPackageName();
        if (packageName == null) {
            packageName = "";
        }
        typesByPackage.computeIfAbsent(packageName, k -> new ArrayList<>()).add(typeInfo);
    }
    
    /**
     * 批量添加类型信息
     */
    public void addTypes(List<Asn1TypeInfo> types) {
        for (Asn1TypeInfo type : types) {
            addType(type);
        }
    }
    
    /**
     * 获取所有类型（扁平列表）
     */
    public List<Asn1TypeInfo> getAllTypes() {
        List<Asn1TypeInfo> allTypes = new ArrayList<>();
        for (List<Asn1TypeInfo> types : typesByPackage.values()) {
            allTypes.addAll(types);
        }
        return allTypes;
    }
    
    /**
     * 获取类型总数
     */
    public int getTypeCount() {
        return typesByPackage.values().stream()
                .mapToInt(List::size)
                .sum();
    }
    
    /**
     * 获取所有包名（排序）
     */
    public List<String> getPackageNames() {
        return new ArrayList<>(typesByPackage.keySet());
    }
    
    /**
     * 根据包名获取类型列表
     */
    public List<Asn1TypeInfo> getTypesByPackage(String packageName) {
        return typesByPackage.getOrDefault(packageName, Collections.emptyList());
    }
    
    // Getters and Setters
    
    public String getModuleName() {
        return moduleName;
    }
    
    public void setModuleName(String moduleName) {
        this.moduleName = moduleName;
    }
    
    public String getVersion() {
        return version;
    }
    
    public void setVersion(String version) {
        this.version = version;
    }
    
    public String getJarPath() {
        return jarPath;
    }
    
    public void setJarPath(String jarPath) {
        this.jarPath = jarPath;
    }
    
    public boolean isBuiltin() {
        return builtin;
    }
    
    public void setBuiltin(boolean builtin) {
        this.builtin = builtin;
    }
    
    public Map<String, List<Asn1TypeInfo>> getTypesByPackage() {
        return typesByPackage;
    }
    
    public void setTypesByPackage(Map<String, List<Asn1TypeInfo>> typesByPackage) {
        this.typesByPackage = typesByPackage;
    }
    
    public long getCreateTime() {
        return createTime;
    }
    
    public void setCreateTime(long createTime) {
        this.createTime = createTime;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Asn1Module that = (Asn1Module) o;
        return Objects.equals(getModuleId(), that.getModuleId());
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(getModuleId());
    }
    
    @Override
    public String toString() {
        return "Asn1Module{" +
                "moduleName='" + moduleName + '\'' +
                ", version='" + version + '\'' +
                ", jarPath='" + jarPath + '\'' +
                ", builtin=" + builtin +
                ", typeCount=" + getTypeCount() +
                '}';
    }
}
