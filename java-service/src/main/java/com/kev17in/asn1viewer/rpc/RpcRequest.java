package com.kev17in.asn1viewer.rpc;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;

public class RpcRequest {
    private final int id;
    private final String method;
    private final JSONObject params;

    public RpcRequest(int id, String method, JSONObject params) {
        this.id = id;
        this.method = method;
        this.params = params != null ? params : new JSONObject();
    }

    public static RpcRequest fromJson(String json) {
        JSONObject obj = JSONUtil.parseObj(json);
        int id = obj.getInt("id", 0);
        String method = obj.getStr("method");
        JSONObject params = obj.getJSONObject("params");
        if (method == null || method.isEmpty()) {
            throw new IllegalArgumentException("Missing 'method' field");
        }
        return new RpcRequest(id, method, params);
    }

    public int getId() { return id; }
    public String getMethod() { return method; }
    public JSONObject getParams() { return params; }
}
