'use client';
import {useI18n,LanguageSwitcher} from '../../components/i18n-provider';
import GoogleLogin from '../../components/google-login';
export const dynamic='force-dynamic';
export default function SignIn(){
 const {t}=useI18n();return <main className="signin"><LanguageSwitcher/><div className="brand-icon">🍚</div><h1>{t("Cơm Nhà")}</h1><p>{t("Đăng nhập Google để dùng trên nhiều thiết bị.")}</p><GoogleLogin/><a className="text-btn" href="/">{t("Tiếp tục đặt cơm không cần đăng nhập →")}</a></main>;}
