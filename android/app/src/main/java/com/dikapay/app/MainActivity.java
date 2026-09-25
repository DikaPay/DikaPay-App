package com.dikapay.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Plugin LOKAL milik aplikasi ini (bukan paket npm) didaftarkan di sini,
     * SEBELUM super.onCreate() — Capacitor membangun Bridge di dalam
     * onCreate(), jadi plugin yang didaftarkan sesudahnya tidak akan ikut
     * terpasang dan pemanggilan dari JavaScript akan gagal "not implemented".
     *
     * IntegritasPlugin memeriksa aplikasi berisiko yang TERPASANG di
     * perangkat lewat PackageManager — sesuatu yang mustahil dilakukan dari
     * dalam WebView. Lihat catatan lengkapnya di IntegritasPlugin.java.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IntegritasPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
