package com.moodhaven.app

import android.app.Activity
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val TAG = "SecureKeyPlugin"
private const val KEY_ALIAS = "MoodHavenTokenKey"
private const val PREFS_NAME = "moodbloom_securekey"
private const val PREF_ENC = "cloud_token_key_enc"
private const val PREF_IV = "cloud_token_key_iv"
private const val LEGACY_KEY_FILE = "cloud_token_key.bin"

/**
 * Hardware-backed storage for the cloud-token encryption key on Android.
 *
 * The 32-byte key (used Rust-side to AES-GCM the OAuth tokens) is wrapped under a
 * non-exportable AndroidKeyStore AES key and persisted as ciphertext in private
 * SharedPreferences — an upgrade over the bare 0600 file the Rust fallback writes.
 *
 * On first run it MIGRATES the existing `cloud_token_key.bin` bytes (so already
 * stored tokens still decrypt) instead of generating a new key. The frontend
 * fetches the key here at startup and hands it to Rust via `cloud_set_token_key`.
 */
@TauriPlugin
class SecureKeyPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getCloudTokenKey(invoke: Invoke) {
        try {
            val keyBytes = loadStoredKey() ?: migrateOrCreateKey()
            val obj = JSObject()
            obj.put("key", toHex(keyBytes))
            invoke.resolve(obj)
        } catch (e: Exception) {
            Log.w(TAG, "getCloudTokenKey failed: ${e.message}")
            invoke.reject("Could not resolve cloud token key: ${e.message}")
        }
    }

    private fun loadStoredKey(): ByteArray? {
        val prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val encB64 = prefs.getString(PREF_ENC, null) ?: return null
        val ivB64 = prefs.getString(PREF_IV, null) ?: return null
        val enc = Base64.decode(encB64, Base64.DEFAULT)
        val iv = Base64.decode(ivB64, Base64.DEFAULT)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, getKeyStoreKey(), GCMParameterSpec(128, iv))
        }
        return cipher.doFinal(enc)
    }

    private fun migrateOrCreateKey(): ByteArray {
        // Prefer the bytes already on disk so existing tokens keep decrypting.
        val legacy = File(activity.filesDir, LEGACY_KEY_FILE)
        val keyBytes = if (legacy.exists() && legacy.length() == 32L) {
            legacy.readBytes()
        } else {
            ByteArray(32).also { SecureRandom().nextBytes(it) }
        }
        storeKey(keyBytes)
        return keyBytes
    }

    private fun storeKey(keyBytes: ByteArray) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, getKeyStoreKey())
        }
        val enc = cipher.doFinal(keyBytes)
        activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_ENC, Base64.encodeToString(enc, Base64.DEFAULT))
            .putString(PREF_IV, Base64.encodeToString(cipher.iv, Base64.DEFAULT))
            .apply()
    }

    private fun getKeyStoreKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            // No setUserAuthenticationRequired — this key wraps a background secret,
            // it must work without a biometric/PIN prompt.
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply { init(spec) }
            .generateKey()
    }

    private fun toHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }
}
