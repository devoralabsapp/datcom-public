import GoogleLogin from '../../components/google-login';
export const dynamic='force-dynamic';
export default function SignIn(){return <main className="signin"><div className="brand-icon">🍚</div><h1>Cơm Nhà</h1><p>Đăng nhập Google để dùng trên nhiều thiết bị.</p><GoogleLogin/><a className="text-btn" href="/">Tiếp tục đặt cơm không cần đăng nhập →</a></main>;}
