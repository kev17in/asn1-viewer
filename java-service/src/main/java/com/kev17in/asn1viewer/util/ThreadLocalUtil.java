package com.kev17in.asn1viewer.util;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * ThreadLocal 工具类,通过在ThreadLocal存储map信息,来实现在ThreadLocal中维护多个信息
 * <br>e.g.<code>
 * ThreadLocalUtils.put("key",value);<br>
 * ThreadLocalUtils.get("key");<br>
 * ThreadLocalUtils.remove("key");<br>
 * ThreadLocalUtils.getAndRemove("key");<br>
 * ThreadLocalUtils.get("key",()-&gt;defaultValue);<br>
 * ThreadLocalUtils.clear();<br>
 * </code>
 *
 * @author xiaok
 * @date 2024/05/09
 */
@SuppressWarnings("unchecked")
public class ThreadLocalUtil {
	private static final ThreadLocal<Map<String, Object>> LOCAL = ThreadLocal.withInitial(HashMap::new);

	/**
	 * @return threadLocal中的全部值
	 */
	public static Map<String, Object> getAll() {
		return new HashMap<>(LOCAL.get());
	}

	/**
	 * 设置一个值到ThreadLocal
	 *
	 * @param key   键
	 * @param value 值
	 * @param <T>   值的类型
	 * @return 被放入的值
	 * @see Map#put(Object, Object)
	 */
	public static <T> T put(String key, T value) {
		LOCAL.get().put(key, value);
		return value;
	}

	/**
	 * 设置一个值到ThreadLocal
	 *
	 * @param map map
	 * @return 被放入的值
	 * @see Map#putAll(Map)
	 */
	public static void put(Map<String, Object> map) {
		LOCAL.get().putAll(map);
	}

	/**
	 * 删除参数对应的值
	 *
	 * @param key
	 * @see Map#remove(Object)
	 */
	public static <T> T remove(String key) {
		return (T) LOCAL.get().remove(key);
	}

	/**
	 * 按键前缀删除
	 *
	 * @param keyPrefix 钥匙
	 */
	public static void removeByKeyPrefix(String keyPrefix) {
		Map<String, Object> map = LOCAL.get();
		List<String> delKeys = map.keySet().stream()
				.filter(k -> k.startsWith(keyPrefix))
				.toList();
		delKeys.forEach(map::remove);
	}


	/**
	 * 清空ThreadLocal
	 *
	 * @see Map#clear()
	 */
	public static void clear() {
		LOCAL.remove();
	}

	/**
	 * 从ThreadLocal中获取值
	 *
	 * @param key 键
	 * @param <T> 值泛型
	 * @return 值, 不存在则返回null, 如果类型与泛型不一致, 可能抛出{@link ClassCastException}
	 * @see Map#get(Object)
	 * @see ClassCastException
	 */
	public static <T> T get(String key) {
		return ((T) LOCAL.get().get(key));
	}

	public static <T> T getIfAbsent(String key, Function<String, T> function) {
		Map<String, Object> m = LOCAL.get();

		Object v = m.get(key);

		if (v != null) return (T) v;

		T computed = function.apply(key);   //*** 这里面不要触碰 ThreadLocalUtil.put/remove/clear

		if (computed != null) {
			m.put(key, computed);
		}

		return computed;
	}

	/**
	 * 获取一个值后然后删除掉
	 *
	 * @param key 键
	 * @param <T> 值类型
	 * @return 值, 不存在则返回null
	 * @see this#get(String)
	 * @see this#remove(String)
	 */
	public static <T> T getAndRemove(String key) {
		try {
			return get(key);
		} finally {
			remove(key);
		}
	}

	/**
	 * finally run
	 *
	 * @param supplier supplier
	 * @param data     data
	 * @return {@link T }
	 */
	public static <T> T finallyRun(Map<String, Object> data, Supplier<T> supplier){
		try {
			put(data);
			return supplier.get();
		} finally {
			clear();
		}
	}

	/**
	 * finally run void
	 *
	 * @param data     data
	 * @param supplier supplier
	 */
	public static void finallyRunVoid(Map<String, Object> data, VoidSupplier supplier){
		finallyRun(data, () -> {
			supplier.get();
			return null;
		});
	}

	/**
	 * void supplier
	 *
	 * @author xiaok
	 * @date 2025/06/25
	 */
	public interface VoidSupplier {
		void get();
	}

}
