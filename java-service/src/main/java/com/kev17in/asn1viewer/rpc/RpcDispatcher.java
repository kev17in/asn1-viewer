package com.kev17in.asn1viewer.rpc;

import com.kev17in.asn1viewer.handler.Asn1Handler;
import com.kev17in.asn1viewer.handler.ModuleHandler;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

public class RpcDispatcher {
    private final Map<String, Function<RpcRequest, RpcResponse>> handlers = new HashMap<>();

    public RpcDispatcher() {
        Asn1Handler asn1 = new Asn1Handler();
        ModuleHandler module = new ModuleHandler();

        handlers.put("getTypeNames", asn1::getTypeNames);
        handlers.put("getDefaultTypeNames", asn1::getDefaultTypeNames);
        handlers.put("getTypeTree", asn1::getTypeTree);
        handlers.put("parseAsn1", asn1::parseAsn1);

        handlers.put("getModules", module::getModules);
        handlers.put("importModule", module::importModule);
        handlers.put("removeModule", module::removeModule);
        handlers.put("scanJar", module::scanJar);
        handlers.put("refreshRegistry", module::refreshRegistry);

        handlers.put("ping", req -> RpcResponse.success(req.getId(), "pong"));
    }

    public RpcResponse dispatch(RpcRequest request) {
        Function<RpcRequest, RpcResponse> handler = handlers.get(request.getMethod());
        if (handler == null) {
            return RpcResponse.error(request.getId(), -32601, "Method not found: " + request.getMethod());
        }
        try {
            return handler.apply(request);
        } catch (Exception e) {
            return RpcResponse.error(request.getId(), -32000, e.getMessage());
        }
    }
}
