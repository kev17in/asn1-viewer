package com.kev17in.asn1viewer.model;

import java.io.Serializable;
import java.util.Objects;

/**
 * ASN.1 类型信息
 * 存储单个BerType子类的元数据
 */
public class Asn1TypeInfo implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 完全限定类名 (如: com.example.asn1.MyType)
     */
    private String fullClassName;
    
    /**
     * 简单类名 (如: MyType)
     */
    private String simpleClassName;
    
    /**
     * 包名 (如: com.example.asn1)
     */
    private String packageName;
    
    public Asn1TypeInfo() {
    }
    
    public Asn1TypeInfo(String fullClassName) {
        this.fullClassName = fullClassName;
        int lastDot = fullClassName.lastIndexOf('.');
        if (lastDot > 0) {
            this.packageName = fullClassName.substring(0, lastDot);
            this.simpleClassName = fullClassName.substring(lastDot + 1);
        } else {
            this.packageName = "";
            this.simpleClassName = fullClassName;
        }
    }
    
    public Asn1TypeInfo(String fullClassName, String simpleClassName, String packageName) {
        this.fullClassName = fullClassName;
        this.simpleClassName = simpleClassName;
        this.packageName = packageName;
    }
    
    public String getFullClassName() {
        return fullClassName;
    }
    
    public void setFullClassName(String fullClassName) {
        this.fullClassName = fullClassName;
    }
    
    public String getSimpleClassName() {
        return simpleClassName;
    }
    
    public void setSimpleClassName(String simpleClassName) {
        this.simpleClassName = simpleClassName;
    }
    
    public String getPackageName() {
        return packageName;
    }
    
    public void setPackageName(String packageName) {
        this.packageName = packageName;
    }
    
    /**
     * 获取显示名称（用于UI展示）
     * 格式: 包名 > 类名
     */
    public String getDisplayName() {
        if (packageName == null || packageName.isEmpty()) {
            return simpleClassName;
        }
        return packageName + " > " + simpleClassName;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Asn1TypeInfo that = (Asn1TypeInfo) o;
        return Objects.equals(fullClassName, that.fullClassName);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(fullClassName);
    }
    
    @Override
    public String toString() {
        return "Asn1TypeInfo{" +
                "fullClassName='" + fullClassName + '\'' +
                ", simpleClassName='" + simpleClassName + '\'' +
                ", packageName='" + packageName + '\'' +
                '}';
    }
}
