package com.dikapay.app;

import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * DikaPay — IntegritasPlugin
 *
 * Memeriksa apakah aplikasi BERISIKO (pengubah APK / cheat engine / kerangka
 * hooking) terpasang di perangkat, lewat PackageManager Android.
 *
 * ================== KENAPA HARUS NATIVE, BUKAN JAVASCRIPT ==================
 * `integritas.js` hanya bisa melihat apa yang terlihat DARI DALAM WebView:
 * objek global yang disuntikkan, userAgent, fungsi bawaan yang ditambal.
 * Daftar aplikasi yang TERPASANG di perangkat sama sekali tidak terjangkau
 * dari JavaScript — tidak ada API-nya. Jadi pemeriksaan paket WAJIB lewat
 * sisi native seperti kelas ini.
 *
 * Keduanya saling melengkapi dan TETAP dipakai bersama: kelas ini menangkap
 * aplikasi yang terpasang walau sedang tidak berjalan; `integritas.js`
 * menangkap penyuntikan yang sedang aktif di WebView (mis. Frida) yang tidak
 * selalu punya paket terpasang.
 *
 * ========================= ANDROID 11+ BUTUH <queries> =====================
 * Sejak Android 11 (API 30) daftar paket disembunyikan: getPackageInfo()
 * melempar NameNotFoundException untuk paket yang TIDAK didaftarkan di
 * <queries> pada AndroidManifest — seolah-olah tidak terpasang, tanpa error
 * apa pun. Karena itu setiap paket di PAKET_BERISIKO WAJIB punya entri
 * <package android:name="..."> di manifest.
 *
 * QUERY_ALL_PACKAGES SENGAJA TIDAK DIPAKAI: izin itu masuk kategori sensitif
 * di Play Store dan sering ditolak kecuali aplikasinya memang butuh melihat
 * seluruh daftar (peluncur, antivirus). Mendaftarkan paket satu per satu di
 * <queries> tidak butuh izin apa pun dan cukup untuk keperluan ini.
 *
 * KONSEKUENSI YANG HARUS DISADARI: pendekatan ini hanya menemukan paket yang
 * SUDAH kita daftarkan. Aplikasi berisiko yang di-rename/di-clone dengan
 * nama paket lain tidak akan terlihat. Ini pertahanan lapis pertama untuk
 * pemakaian kasual, bukan jaminan — pelindung uang yang sesungguhnya tetap
 * pemeriksaan di sisi server.
 *
 * ============================ TIDAK FAIL-CLOSED ============================
 * Kelas ini TIDAK PERNAH memutuskan sendiri untuk memblokir. Ia cuma
 * melaporkan apa yang ditemukan; yang memutuskan adalah `integritas.js`.
 * Kalau pemeriksaannya sendiri bermasalah, ia mengembalikan daftar KOSONG
 * (bukan melempar), supaya member tidak terkunci dari uangnya gara-gara
 * pemeriksaan yang gagal. Lihat catatan "KENAPA TIDAK FAIL-CLOSED" di
 * integritas.js.
 */
@CapacitorPlugin(name = "Integritas")
public class IntegritasPlugin extends Plugin {

    /**
     * SATU tag untuk semua log kelas ini, supaya bisa disaring dengan
     *   adb logcat -s DikaPayIntegritas:V
     * Lihat petunjuk lengkapnya di integritas.js.
     */
    private static final String TAG = "DikaPayIntegritas";

    /**
     * Dipanggil Capacitor saat plugin dipasang ke Bridge. Kalau baris ini
     * TIDAK muncul di logcat, berarti plugin tidak pernah terdaftar sama
     * sekali (registerPlugin di MainActivity tidak jalan / dipanggil SESUDAH
     * super.onCreate) — dan semua log lain di bawah juga tidak akan ada.
     * Ini pemeriksaan PERTAMA saat deteksi "tidak terpicu".
     */
    @Override
    public void load() {
        super.load();
        Log.i(TAG, "PLUGIN TERPASANG. Android SDK=" + Build.VERSION.SDK_INT
            + " (" + Build.VERSION.RELEASE + "), perangkat=" + Build.MANUFACTURER
            + " " + Build.MODEL + ", daftar paket berisiko=" + PAKET_BERISIKO.length);
        if (Build.VERSION.SDK_INT >= 30) {
            Log.i(TAG, "Android 11+ terdeteksi: paket HANYA terlihat kalau terdaftar "
                + "di <queries> AndroidManifest. Paket berisiko yang tidak terdaftar "
                + "akan terbaca 'tidak terpasang' tanpa error apa pun.");
        }
    }

    /**
     * Nama paket beserta label yang ditampilkan ke member.
     * Baris = { nama paket, label }.
     *
     * Beberapa aplikasi punya LEBIH DARI SATU nama paket (versi resmi,
     * versi forum, hasil rebrand), jadi satu label bisa muncul beberapa kali
     * dengan paket berbeda — itu disengaja.
     */
    private static final String[][] PAKET_BERISIKO = {
        // Lucky Patcher — pengubah APK / pembobol pembelian dalam aplikasi
        { "com.dimonvideo.luckypatcher", "Lucky Patcher" },
        { "com.forpda.lp", "Lucky Patcher" },
        { "com.android.vending.billing.InAppBillingService.LUCK", "Lucky Patcher" },
        { "com.android.vending.billing.InAppBillingService.LACK", "Lucky Patcher" },
        { "com.android.vending.billing.InAppBillingService.CLON", "Lucky Patcher" },

        // Game Guardian — pengubah nilai memori saat aplikasi berjalan
        { "catch_.me.if.you.can", "Game Guardian" },
        { "com.gameguardian.app", "Game Guardian" },

        // APK Editor / APK Editor Pro beserta variannya
        { "com.gmail.heagoo.apkeditor", "APK Editor" },
        { "com.gmail.heagoo.apkeditor.pro", "APK Editor Pro" },
        { "com.gmail.heagoo.apkeditor.ppro", "APK Editor Pro" },
        { "com.gmail.heagoo.apkeditor.trial", "APK Editor" },
        { "com.gmail.heagoo.apppacker", "App Packer" },

        // Xposed / LSPosed / EdXposed — kerangka hooking tingkat sistem
        { "de.robv.android.xposed.installer", "Xposed Installer" },
        { "org.meowcat.edxposed.manager", "EdXposed Manager" },
        { "org.lsposed.manager", "LSPosed Manager" },
        { "io.va.exposed", "VirtualXposed" },
        { "me.weishu.exp", "TaiChi (Xposed)" },

        // Magisk — pengelola root
        { "com.topjohnwu.magisk", "Magisk" },
        { "io.github.huskydg.magisk", "Magisk Delta" },

        // Frida — kerangka instrumentasi dinamis
        { "re.frida.server", "Frida Server" },

        // Alat pembobol pembelian lain yang umum dipasang berdampingan
        { "uret.jasi2169.patcher", "Uret Patcher" },
        { "zone.jasi2169.uretpatcher", "Uret Patcher" },
        { "com.chelpus.lackypatch", "Lucky Patcher (lama)" },
        { "com.blackmartalpha", "Blackmart" },
        { "org.creeplays.hack", "Creeplays Hack" },
        { "com.baseappfull.fwd", "AppCake" },
        { "com.repodroid.app", "RepoDroid" },
        { "cc.madkite.freedom", "Freedom (bypass pembayaran)" },
    };

    /**
     * -> { temuan: [ "Lucky Patcher", ... ], diperiksa: 28, didukung: true }
     *
     * `temuan` berisi LABEL (bukan nama paket) karena inilah yang ditampilkan
     * ke member di layar peringatan. Label yang sama tidak diulang walau dua
     * nama paketnya sama-sama terpasang.
     */
    @PluginMethod
    public void periksaPaket(PluginCall call) {
        long mulai = System.currentTimeMillis();
        Log.i(TAG, "=== periksaPaket() DIPANGGIL dari JS ===");

        JSObject hasil = new JSObject();
        JSArray temuan = new JSArray();
        JSArray paketTerlihat = new JSArray();
        int diperiksa = 0;
        int dilewatiDuplikat = 0;

        try {
            PackageManager pm = getContext().getPackageManager();
            List<String> sudahAda = new ArrayList<>();

            for (String[] baris : PAKET_BERISIKO) {
                String paket = baris[0];
                String label = baris[1];
                diperiksa++;
                if (sudahAda.contains(label)) {
                    /* Label sudah ketemu lewat nama paket lain — TIDAK
                       diperiksa lagi. Dicatat supaya angka di log tidak
                       membingungkan saat dibaca (diperiksa != dipanggil). */
                    dilewatiDuplikat++;
                    continue;
                }
                boolean ada = terpasang(pm, paket);
                /* Tiap paket dicatat satu baris. Verbose (bukan info) supaya
                   28 baris ini tidak membanjiri log biasa, tapi tetap bisa
                   dibaca dengan `adb logcat -s DikaPayIntegritas:V`. */
                Log.v(TAG, "  cek " + paket + " -> " + (ada ? "TERPASANG" : "tidak ada"));
                if (ada) {
                    sudahAda.add(label);
                    temuan.put(label);
                    paketTerlihat.put(paket);
                    Log.w(TAG, "  !! DITEMUKAN: " + label + " (" + paket + ")");
                }
            }

            hasil.put("didukung", true);
        } catch (Throwable t) {
            /* Pemeriksaannya sendiri bermasalah -> laporkan sebagai TIDAK
               DIDUKUNG dengan temuan kosong, JANGAN melempar. Melempar akan
               membuat integritas.js menerima galat, dan kalau suatu saat
               galat itu diperlakukan sebagai "mencurigakan", member dengan
               perangkat baik-baik saja akan ikut terkunci. */
            Log.e(TAG, "Pemeriksaan paket GAGAL TOTAL, dilewati: " + t, t);
            hasil.put("didukung", false);
        }

        long lama = System.currentTimeMillis() - mulai;
        hasil.put("temuan", temuan);
        hasil.put("diperiksa", diperiksa);
        hasil.put("dilewatiDuplikat", dilewatiDuplikat);
        /* Nama paket yang benar-benar terlihat — dipakai saat mendiagnosa
           "kenapa labelnya muncul/tidak muncul". */
        hasil.put("paket", paketTerlihat);
        hasil.put("lamaMs", lama);
        hasil.put("sdk", Build.VERSION.SDK_INT);

        Log.i(TAG, "=== periksaPaket() SELESAI dalam " + lama + " ms. "
            + "diperiksa=" + diperiksa + ", dilewatiDuplikat=" + dilewatiDuplikat
            + ", temuan=" + temuan.length() + " ===");
        Log.i(TAG, "HASIL MENTAH yang dikirim ke JS: " + hasil.toString());

        if (temuan.length() == 0) {
            Log.i(TAG, "Tidak ada temuan. Kalau kamu YAKIN aplikasi berisiko terpasang, "
                + "periksa: (1) nama paketnya ada di PAKET_BERISIKO? "
                + "(2) nama paket yang SAMA ada di <queries> AndroidManifest? "
                + "(3) baris 'cek <paket>' di atas muncul untuk paket itu? "
                + "Pakai `adb shell pm list packages | grep -i <kata>` untuk tahu nama paket aslinya.");
        }

        call.resolve(hasil);
    }

    /**
     * Diagnosa MENTAH: seluruh daftar beserta status terlihat/tidak, tanpa
     * dedupe label. Dipakai integritas.js saat mode diagnosa dinyalakan, dan
     * saat menjawab pertanyaan "kenapa aplikasi X tidak terdeteksi".
     */
    @PluginMethod
    public void diagnosa(PluginCall call) {
        Log.i(TAG, "=== diagnosa() DIPANGGIL dari JS ===");
        JSObject hasil = new JSObject();
        JSArray baris = new JSArray();
        try {
            PackageManager pm = getContext().getPackageManager();
            for (String[] b : PAKET_BERISIKO) {
                JSObject o = new JSObject();
                o.put("paket", b[0]);
                o.put("label", b[1]);
                o.put("terpasang", terpasang(pm, b[0]));
                baris.put(o);
            }
            hasil.put("didukung", true);
        } catch (Throwable t) {
            Log.e(TAG, "diagnosa() gagal: " + t, t);
            hasil.put("didukung", false);
        }
        hasil.put("daftar", baris);
        hasil.put("sdk", Build.VERSION.SDK_INT);
        hasil.put("perangkat", Build.MANUFACTURER + " " + Build.MODEL);
        Log.i(TAG, "diagnosa() HASIL MENTAH: " + hasil.toString());
        call.resolve(hasil);
    }

    /**
     * getPackageInfo() melempar NameNotFoundException kalau paketnya tidak
     * ada ATAU tidak terlihat (tidak terdaftar di <queries>). Keduanya
     * diperlakukan sama: "tidak terpasang". Itu berarti lupa mendaftarkan
     * paket di manifest membuat deteksinya diam-diam tidak berfungsi —
     * bukan error yang kelihatan. Kalau menambah paket di PAKET_BERISIKO,
     * TAMBAHKAN JUGA di <queries> AndroidManifest.xml.
     */
    private boolean terpasang(PackageManager pm, String paket) {
        try {
            pm.getPackageInfo(paket, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        } catch (Throwable t) {
            /* Galat tak terduga pada SATU paket tidak boleh menggagalkan
               pemeriksaan paket lainnya. */
            Log.w(TAG, "Gagal memeriksa paket " + paket + ": " + t);
            return false;
        }
    }
}
