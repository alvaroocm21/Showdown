package com.duelos.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.os.Environment;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.provider.DocumentsContract;
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
    private static final int REQ_DIR = 72;
    private String pendingKey;
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
            // ---- Carpetas elegidas por la persona (mods y partida): se recuerdan entre sesiones ----
            @JavascriptInterface
            public void pickFolder(final String key) {
                runOnUiThread(new Runnable() { public void run() {
                    pendingKey = key;
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                    try { startActivityForResult(i, REQ_DIR); } catch (Exception e) { sendFolder(key, ""); }
                } });
            }
            @JavascriptInterface
            public String folderName(String key) {
                String u = getSharedPreferences("duelos", 0).getString("dir_" + key, "");
                if (u.length() == 0) return "";
                try { String id = DocumentsContract.getTreeDocumentId(Uri.parse(u)); int c = id.lastIndexOf(':'); return c >= 0 ? id.substring(c + 1) : id; }
                catch (Exception e) { return ""; }
            }
            // Abre un archivo (ruta relativa con subcarpetas) dentro de la carpeta elegida, sustituyendo el que hubiera; luego saveChunk/saveEnd.
            @JavascriptInterface
            public boolean dirStart(String key, String rel) {
                try {
                    closeSave();
                    String u = getSharedPreferences("duelos", 0).getString("dir_" + key, "");
                    if (u.length() == 0) return false;
                    Uri tree = Uri.parse(u);
                    String doc = DocumentsContract.getTreeDocumentId(tree);
                    String[] parts = rel.split("/");
                    for (int k = 0; k < parts.length - 1; k++) {
                        String c = child(tree, doc, parts[k]);
                        if (c == null) {
                            Uri n = DocumentsContract.createDocument(getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, doc), DocumentsContract.Document.MIME_TYPE_DIR, parts[k]);
                            if (n == null) return false;
                            c = DocumentsContract.getDocumentId(n);
                        }
                        doc = c;
                    }
                    String name = parts[parts.length - 1], old = child(tree, doc, name);
                    if (old != null) DocumentsContract.deleteDocument(getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, old));
                    Uri f = DocumentsContract.createDocument(getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, doc), "application/octet-stream", name);
                    if (f == null) return false;
                    saveOut = getContentResolver().openOutputStream(f);
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

    private String child(Uri tree, String parentDoc, String name) {
        Cursor c = null;
        try {
            c = getContentResolver().query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentDoc),
                new String[]{ DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null);
            while (c != null && c.moveToNext()) if (name.equals(c.getString(1))) return c.getString(0);
        } catch (Exception e) { } finally { if (c != null) c.close(); }
        return null;
    }

    private void sendFolder(final String key, final String name) {
        runOnUiThread(new Runnable() { public void run() {
            web.evaluateJavascript("window.__folderPicked&&window.__folderPicked(" + org.json.JSONObject.quote(key) + "," + org.json.JSONObject.quote(name) + ")", null);
        } });
    }

    private void closeSave() {
        try { if (saveOut != null) saveOut.close(); } catch (Exception e) { }
        saveOut = null; saveUri = null; saveFile = null;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_DIR) {
            String key = pendingKey == null ? "" : pendingKey;
            if (res == RESULT_OK && data != null && data.getData() != null) {
                Uri u = data.getData();
                try { getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception e) { }
                getSharedPreferences("duelos", 0).edit().putString("dir_" + key, u.toString()).apply();
            }
            sendFolder(key, "");
            return;
        }
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
