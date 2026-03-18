package com.kev17in.asn1viewer.rpc;

import cn.hutool.json.JSONObject;

public class RpcResponse {
    private final int id;
    private final Object result;
    private final JSONObject errorObj;

    private RpcResponse(int id, Object result, JSONObject errorObj) {
        this.id = id;
        this.result = result;
        this.errorObj = errorObj;
    }

    public static RpcResponse success(int id, Object result) {
        return new RpcResponse(id, result, null);
    }

    public static RpcResponse error(int id, int code, String message) {
        JSONObject err = new JSONObject();
        err.set("code", code);
        err.set("message", message);
        return new RpcResponse(id, null, err);
    }

    public JSONObject toJson() {
        JSONObject obj = new JSONObject();
        obj.set("id", id);
        if (errorObj != null) {
            obj.set("error", errorObj);
        } else {
            obj.set("result", result);
        }
        return obj;
    }
}
