package com.kev17in.asn1viewer;

import com.kev17in.asn1viewer.rpc.RpcDispatcher;
import com.kev17in.asn1viewer.rpc.RpcRequest;
import com.kev17in.asn1viewer.rpc.RpcResponse;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

public class ServiceMain {

    public static void main(String[] args) {
        System.setProperty("file.encoding", "UTF-8");
        System.setProperty("sun.jnu.encoding", "UTF-8");

        PrintStream stdout = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        // Redirect System.out so log frameworks don't pollute the RPC channel
        System.setOut(new PrintStream(System.err, true, StandardCharsets.UTF_8));

        RpcDispatcher dispatcher = new RpcDispatcher();

        // Signal readiness
        stdout.println(JSONUtil.toJsonStr(new JSONObject().set("ready", true)));
        stdout.flush();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;

                RpcResponse response;
                try {
                    RpcRequest request = RpcRequest.fromJson(line);
                    response = dispatcher.dispatch(request);
                } catch (Exception e) {
                    response = RpcResponse.error(0, -32700, "Parse error: " + e.getMessage());
                }

                stdout.println(JSONUtil.toJsonStr(response.toJson()));
                stdout.flush();
            }
        } catch (Exception e) {
            System.err.println("Fatal error in service main loop: " + e.getMessage());
            e.printStackTrace(System.err);
            System.exit(1);
        }
    }
}
