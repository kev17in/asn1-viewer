package com.kev17in.asn1viewer.util;

import cn.hutool.core.util.ArrayUtil;
import com.beanit.asn1bean.ber.ReverseByteArrayOutputStream;
import com.beanit.asn1bean.ber.types.BerType;
import org.bouncycastle.util.encoders.Base64;
import org.bouncycastle.util.encoders.Hex;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.function.Supplier;

public interface Asn1Util {

    /**
     * decode base64 data
     *
     * @param base64Data      base64 data
     * @param berTypeSupplier ber type supplier
     * @return {@link T }
     * @throws IOException ioexception
     */
    static <T extends BerType> T decodeBase64Data(String base64Data, Supplier<T> berTypeSupplier) throws IOException {
        return decode(Base64.decode(base64Data), berTypeSupplier);
    }


    /**
     * decode hex
     *
     * @param hexData         hex data
     * @param berTypeSupplier ber type supplier
     * @return {@link T }
     * @throws IOException ioexception
     */
    static <T extends BerType> T decodeHex(String hexData, Supplier<T> berTypeSupplier) throws IOException {
        return decode(Hex.decode(hexData), berTypeSupplier);
    }


    /**
     * decode
     *
     * @param data            data
     * @param berTypeSupplier ber type supplier
     * @return {@link T }
     * @throws IOException ioexception
     */
    static <T extends BerType> T decode(byte[] data, Supplier<T> berTypeSupplier) throws IOException {
        T berType = berTypeSupplier.get();
        if(ArrayUtil.isEmpty(data)){
            return berType;
        }
        berType.decode(new ByteArrayInputStream(data));
        return berType;
    }



    /**
     * encode to base64 data
     *
     * @param berType ber type
     * @return {@link String }
     * @throws IOException ioexception
     */
    static <T extends BerType> String encodeToBase64Data(BerType berType) throws IOException {
        return Base64.toBase64String(encode(berType));
    }

    /**
     * encode to hex data
     *
     * @param berType ber type
     * @return {@link String }
     * @throws IOException ioexception
     */
    static <T extends BerType> String encodeToHex(BerType berType) throws IOException {
        return Hex.toHexString(encode(berType));
    }

    /**
     * encode
     *
     * @param berType ber type
     * @return {@link byte[] }
     * @throws IOException ioexception
     */
    static <T extends BerType> byte[] encode(BerType berType) throws IOException {
        return encode(berType::encode);
    }

    /**
     * encode
     *
     * @param consumer consumer
     * @return {@link byte[] }
     * @throws IOException ioexception
     */
    static <T extends BerType> byte[] encode(EConsumer<OutputStream, IOException> consumer) throws IOException {
        try(ReverseByteArrayOutputStream outputStream = new ReverseByteArrayOutputStream(8192, Boolean.TRUE)) {
            consumer.accept(outputStream);
            return outputStream.getArray();
        }
    }



    @FunctionalInterface
    interface EConsumer<T, E extends Exception> {

        /**
         * 接受
         *
         * @param t t
         * @throws Exception 异常
         */
        void accept(T t) throws E;
    }
}
