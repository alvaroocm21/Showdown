/** Cuenta y copia en la nube (Firebase Auth + Firestore). El SDK se carga solo cuando hace falta; sin conexión todo sigue en local. */

/** Claves públicas por diseño: lo que protege los datos son las reglas de Firestore (cada cuenta solo lee lo suyo). */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDwsGzsfB0_Vngio2AimSOgDCUZLa_j4_o',
  authDomain: 'pokemonopoly-2cac6.firebaseapp.com',
  projectId: 'pokemonopoly-2cac6',
  storageBucket: 'pokemonopoly-2cac6.firebasestorage.app',
  messagingSenderId: '260436849903',
  appId: '1:260436849903:web:9a15009cce42f3faf3171a',
};
const BASE = 'https://www.gstatic.com/firebasejs/10.14.1/';

export interface CloudDoc {
  json: string;
  upd: number;
}
export type CloudUser = { email: string | null; uid: string } | null;

/* eslint-disable @typescript-eslint/no-explicit-any */
let fb: { app: any; auth: any; fs: any } | null = null;
let auth: any = null;
let db: any = null;
let user: CloudUser = null;
let ready: Promise<boolean> | null = null;
const listeners = new Set<(u: CloudUser) => void>();

const importUrl = (file: string): Promise<any> => import(/* @vite-ignore */ BASE + file);

function init(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    try {
      const [app, a, fs] = await Promise.all([importUrl('firebase-app.js'), importUrl('firebase-auth.js'), importUrl('firebase-firestore.js')]);
      fb = { app, auth: a, fs };
      const inst = app.initializeApp(FIREBASE_CONFIG);
      auth = a.getAuth(inst);
      db = fs.getFirestore(inst);
      a.onAuthStateChanged(auth, (u: any) => {
        user = u ? { email: u.email ?? null, uid: u.uid } : null;
        listeners.forEach((f) => f(user));
      });
      return true;
    } catch {
      ready = null;
      return false;
    }
  })();
  return ready;
}

function errorText(e: any): string {
  const c: string = e?.code ?? '';
  if (/invalid-email/.test(c)) return 'El correo no es válido.';
  if (/weak-password/.test(c)) return 'La contraseña es muy corta (mínimo 6 caracteres).';
  if (/email-already-in-use/.test(c)) return 'Ya existe una cuenta con ese correo. Prueba a entrar.';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Correo o contraseña incorrectos.';
  if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera un poco.';
  if (/network/.test(c)) return 'Sin conexión.';
  if (/popup-closed|cancelled-popup/.test(c)) return 'Cancelado.';
  if (/unauthorized-domain/.test(c)) return 'Esta dirección no está autorizada en Firebase (Authentication → Configuración → Dominios autorizados).';
  return `No se pudo completar (${c || 'error'}).`;
}

async function run(fn: () => Promise<unknown>): Promise<{ error?: string }> {
  try {
    if (!(await init())) return { error: 'No se pudo cargar el servicio. Comprueba la conexión.' };
    await fn();
    return {};
  } catch (e) {
    return { error: errorText(e) };
  }
}

const docRef = () => fb!.fs.doc(db, 'users', user!.uid, 'liga', 'save');

export const cloud = {
  /** Dentro del APK (Capacitor) Google no deja abrir su ventana de acceso: ahí solo correo y contraseña. */
  googleOk: (): boolean => !(window as any).Capacitor?.isNativePlatform?.(),
  user: (): CloudUser => user,
  /** Se avisa al iniciar o cerrar sesión (y al recuperar una sesión guardada). Devuelve la función para dejar de escuchar. */
  onChange(f: (u: CloudUser) => void): () => void {
    listeners.add(f);
    void init();
    return () => listeners.delete(f);
  },
  signIn: (email: string, password: string, create: boolean) =>
    run(() => (create ? fb!.auth.createUserWithEmailAndPassword(auth, email, password) : fb!.auth.signInWithEmailAndPassword(auth, email, password))),
  signInGoogle: () => run(() => fb!.auth.signInWithPopup(auth, new fb!.auth.GoogleAuthProvider())),
  resetPassword: (email: string) => run(() => fb!.auth.sendPasswordResetEmail(auth, email)),
  signOut: () => run(() => fb!.auth.signOut(auth)),
  /** Partida guardada en la cuenta (null si no hay, o undefined si no se pudo leer). */
  async pull(): Promise<CloudDoc | null | undefined> {
    try {
      if (!user || !(await init())) return undefined;
      const snap = await fb!.fs.getDoc(docRef());
      return snap.exists() ? (snap.data() as CloudDoc) : null;
    } catch {
      return undefined;
    }
  },
  async push(doc: CloudDoc): Promise<boolean> {
    try {
      if (!user || !(await init())) return false;
      await fb!.fs.setDoc(docRef(), doc);
      return true;
    } catch {
      return false;
    }
  },
};
