import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase';
import { useAuth } from '../../context/AuthContext';

export default function LoginButton() {
  const { user, loading } = useAuth();

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Login failed:', err);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (loading) return null;

  if (user) {
    return (
      <div className="auth-user">
        {user.photoURL && (
          <img src={user.photoURL} alt="" className="auth-avatar" referrerPolicy="no-referrer" />
        )}
        <span className="auth-name">{user.displayName || user.email}</span>
        <button className="btn btn-secondary auth-logout-btn" onClick={handleLogout}>
          登出
        </button>
      </div>
    );
  }

  return (
    <button className="btn btn-primary auth-login-btn" onClick={handleLogin}>
      Google 登入
    </button>
  );
}
