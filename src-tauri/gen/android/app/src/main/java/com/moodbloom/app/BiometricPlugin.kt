package com.moodbloom.app

import android.app.Activity
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEY_ALIAS = "MoodBloomBiometricKey"
private const val PREFS_NAME = "moodbloom_biometric"
private const val PREF_ENCRYPTED_PW = "encrypted_password"
private const val PREF_IV = "iv"

@TauriPlugin(name = "biometric")
class BiometricPlugin(private val activity: Activity) : Plugin(activity) {

    // ── Check if strong biometrics are enrolled on the device ────────────────
    @Command
    fun isAvailable(invoke: Invoke) {
        val bm = BiometricManager.from(activity)
        val canAuth = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        val obj = JSObject()
        obj.put("available", canAuth == BiometricManager.BIOMETRIC_SUCCESS)
        invoke.resolve(obj)
    }

    // ── Check if we have an encrypted password stored ────────────────────────
    @Command
    fun isEnrolled(invoke: Invoke) {
        val prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val enrolled = prefs.getString(PREF_ENCRYPTED_PW, null) != null
        val obj = JSObject()
        obj.put("enrolled", enrolled)
        invoke.resolve(obj)
    }

    // ── Enroll: authenticate via BiometricPrompt, then encrypt + store password
    @Command
    fun enroll(invoke: Invoke) {
        val password = invoke.getString("password") ?: run {
            invoke.reject("Missing password")
            return
        }

        // Ensure a fresh KeyStore key exists
        try {
            generateKey()
        } catch (e: Exception) {
            invoke.reject("Key generation failed: ${e.message}")
            return
        }

        val executor = ContextCompat.getMainExecutor(activity)
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                try {
                    val cipher = result.cryptoObject?.cipher
                        ?: throw Exception("No cipher returned")
                    val encrypted = cipher.doFinal(password.toByteArray(Charsets.UTF_8))
                    val iv = cipher.iv

                    activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit()
                        .putString(PREF_ENCRYPTED_PW, Base64.encodeToString(encrypted, Base64.DEFAULT))
                        .putString(PREF_IV, Base64.encodeToString(iv, Base64.DEFAULT))
                        .apply()

                    val obj = JSObject()
                    obj.put("success", true)
                    invoke.resolve(obj)
                } catch (e: Exception) {
                    invoke.reject("Encryption failed: ${e.message}")
                }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                invoke.reject("CANCELLED")
            }

            override fun onAuthenticationFailed() {
                // Individual attempt failed — prompt remains open, do nothing
            }
        }

        activity.runOnUiThread {
            try {
                val cipher = buildEncryptCipher()
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Enable Biometric Unlock")
                    .setSubtitle("Scan your fingerprint to enable quick unlock")
                    .setNegativeButtonText("Cancel")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                BiometricPrompt(activity as FragmentActivity, executor, callback)
                    .authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } catch (e: Exception) {
                invoke.reject("Failed to start biometric: ${e.message}")
            }
        }
    }

    // ── Authenticate: show BiometricPrompt and return the decrypted password ─
    @Command
    fun authenticate(invoke: Invoke) {
        val prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val encryptedB64 = prefs.getString(PREF_ENCRYPTED_PW, null)
        val ivB64 = prefs.getString(PREF_IV, null)

        if (encryptedB64 == null || ivB64 == null) {
            invoke.reject("NOT_ENROLLED")
            return
        }

        val encrypted = Base64.decode(encryptedB64, Base64.DEFAULT)
        val iv = Base64.decode(ivB64, Base64.DEFAULT)

        val executor = ContextCompat.getMainExecutor(activity)
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                try {
                    val cipher = result.cryptoObject?.cipher
                        ?: throw Exception("No cipher returned")
                    val decrypted = cipher.doFinal(encrypted)
                    val password = String(decrypted, Charsets.UTF_8)

                    val obj = JSObject()
                    obj.put("password", password)
                    invoke.resolve(obj)
                } catch (e: Exception) {
                    // Key may have been invalidated by new biometric enrollment
                    clearEnrolledData()
                    invoke.reject("INVALIDATED")
                }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                // errorCode 10 = user cancelled / pressed negative button
                invoke.reject("CANCELLED")
            }

            override fun onAuthenticationFailed() {
                // Individual attempt failed — prompt remains open
            }
        }

        activity.runOnUiThread {
            try {
                val cipher = buildDecryptCipher(iv)
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock MoodBloom")
                    .setSubtitle("Confirm your identity to access your journal")
                    .setNegativeButtonText("Use Password")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                BiometricPrompt(activity as FragmentActivity, executor, callback)
                    .authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } catch (e: Exception) {
                // Cipher init failed — key likely invalidated by new biometric enrollment
                clearEnrolledData()
                invoke.reject("INVALIDATED")
            }
        }
    }

    // ── Unenroll: remove stored credentials and KeyStore key ─────────────────
    @Command
    fun unenroll(invoke: Invoke) {
        clearEnrolledData()
        val obj = JSObject()
        obj.put("success", true)
        invoke.resolve(obj)
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun generateKey() {
        // Delete any existing key first to ensure a fresh key is used
        val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
        if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS)

        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .build()

        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply { init(spec) }
            .generateKey()
    }

    private fun getKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
        return ks.getKey(KEY_ALIAS, null) as SecretKey
    }

    private fun buildEncryptCipher(): Cipher =
        Cipher.getInstance("AES/GCM/NoPadding").also {
            it.init(Cipher.ENCRYPT_MODE, getKey())
        }

    private fun buildDecryptCipher(iv: ByteArray): Cipher =
        Cipher.getInstance("AES/GCM/NoPadding").also {
            it.init(Cipher.DECRYPT_MODE, getKey(), GCMParameterSpec(128, iv))
        }

    private fun clearEnrolledData() {
        activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(PREF_ENCRYPTED_PW)
            .remove(PREF_IV)
            .apply()
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
            if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS)
        } catch (_: Exception) {}
    }
}
