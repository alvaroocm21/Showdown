package com.duelos.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.os.Environment;
import android.util.Base64;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.InputStream;

/** Ventana WebView a pantalla completa que sirve la web empaquetada en assets/www. */
public class MainActivity extends Activity {
    private static final String HOST = "https://appassets.duelos.local/";
    private WebView web;
    private static final int REQ_FILE = 71;
    private ValueCallback<Uri[]> fileCb;
    // Guardado de archivos en Descargas (la web los manda por trozos con saveStart / saveChunk / saveEnd)
    private OutputStream saveOut;
    private Uri saveUri;
    private File saveFile;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0E0C18);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " DuelosAPK");

        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean saveStart(String name) {
                try {
                    closeSave();
                    String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                    if (android.os.Build.VERSION.SDK_INT >= 29) {
                        ContentValues v = new ContentValues();
                        v.put("_display_name", safe);
                        v.put("mime_type", safe.endsWith(".zip") ? "application/zip" : "application/octet-stream");
                        v.put("relative_path", "Download/");
                        saveUri = getContentResolver().insert(Uri.parse("content://media/external/downloads"), v);
                        if (saveUri == null) return false;
                        saveOut = getContentResolver().openOutputStream(saveUri);
                    } else {
                        File dir = Environment.getExternalStoragePublicDirectory("Download");
                        dir.mkdirs();
                        saveFile = new File(dir, safe);
                        saveOut = new FileOutputStream(saveFile);
                    }
                    return saveOut != null;
                } catch (Exception e) { closeSave(); return false; }
            }
            @JavascriptInterface
            public boolean saveChunk(String b64) {
                try { saveOut.write(Base64.decode(b64, Base64.DEFAULT)); return true; }
                catch (Exception e) { closeSave(); return false; }
            }
            @JavascriptInterface
            public boolean saveEnd() {
                try { saveOut.flush(); closeSave(); return true; } catch (Exception e) { closeSave(); return false; }
            }
            @JavascriptInterface
            public void landscape(final boolean on) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        // 6 = SCREEN_ORIENTATION_SENSOR_LANDSCAPE, 4 = SENSOR (cualquiera)
                        setRequestedOrientation(on ? 6 : 4);
                    }
                });
            }
        }, "AndroidApp");

        web.setWebChromeClient(new WebChromeClient() {
            // Selector de archivos (la ROM y el mod en .zip)
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(Intent.createChooser(i, "Elegir archivo"), REQ_FILE); }
                catch (Exception e) { fileCb = null; cb.onReceiveValue(null); return false; }
                return true;
            }
            // alert() y confirm() de la web
            @Override
            public boolean onJsAlert(WebView v, String url, String msg, final JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setCancelable(false)
                    .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                        public void onClick(DialogInterface d, int w) { r.confirm(); } }).show();
                return true;
            }
            @Override
            public boolean onJsConfirm(WebView v, String url, String msg, final JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setCancelable(false)
                    .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                        public void onClick(DialogInterface d, int w) { r.confirm(); } })
                    .setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                        public void onClick(DialogInterface d, int w) { r.cancel(); } }).show();
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (url.startsWith(HOST)) {
                    String path = url.substring(HOST.length());
                    int q = path.indexOf('?');
                    if (q >= 0) path = path.substring(0, q);
                    int h = path.indexOf('#');
                    if (h >= 0) path = path.substring(0, h);
                    if (path.length() == 0) path = "index.html";
                    try {
                        InputStream in = getAssets().open("www/" + path);
                        return new WebResourceResponse(mime(path), "UTF-8", in);
                    } catch (IOException e) {
                        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                                new ByteArrayInputStream(new byte[0]));
                    }
                }
                return super.shouldInterceptRequest(view, url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith(HOST)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { }
                return true;
            }
        });
        web.loadUrl(HOST + "index.html");
        hideSystemUi();
    }

    private void closeSave() {
        try { if (saveOut != null) saveOut.close(); } catch (Exception e) { }
        saveOut = null; saveUri = null; saveFile = null;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != REQ_FILE) { super.onActivityResult(req, res, data); return; }
        if (fileCb == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null && data.getData() != null) out = new Uri[]{ data.getData() };
        fileCb.onReceiveValue(out);
        fileCb = null;
    }

    private static String mime(String p) {
        p = p.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private void hideSystemUi() {
        // LAYOUT_STABLE | LAYOUT_HIDE_NAVIGATION | LAYOUT_FULLSCREEN | HIDE_NAVIGATION | FULLSCREEN | IMMERSIVE_STICKY
        getWindow().getDecorView().setSystemUiVisibility(0x100 | 0x200 | 0x400 | 0x2 | 0x4 | 0x1000);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        // La web decide: vuelve a la pantalla anterior; si ya está en la primera, se cierra la app.
        web.evaluateJavascript("(function(){return window.__back?window.__back():false})()", new ValueCallback<String>() {
            public void onReceiveValue(String v) {
                if (!"true".equals(v)) finish();
            }
        });
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() { if (web != null) { web.destroy(); } super.onDestroy(); }
}
