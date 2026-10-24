'use client';
import {useEffect,useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {useI18n} from '../components/i18n-provider';
import type {MealClient} from '../lib/meal-client';
import {readOrganization,readPersonalProfile} from '../lib/organization';
export default function AccountButton({client,userId,displayName,admin,refreshKey,onClick}:{client:MealClient|null;userId:string;displayName:string;admin:boolean;refreshKey:number;onClick:()=>void}){
 const {t}=useI18n(),[person,setPerson]=useState<{name:string;affiliation:string}|null>(null);
 useEffect(()=>{let active=true;setPerson(null);if(userId&&client)void Promise.all([readPersonalProfile(client),readOrganization(client)]).then(([profile,catalog])=>{if(active&&client.auth.currentUser?.uid===userId)setPerson({name:profile.preferredName,affiliation:[catalog.companies.find(c=>c.id===profile.companyId)?.name,catalog.departments.find(d=>d.id===profile.departmentId)?.name].filter(Boolean).join(' · ')});}).catch(()=>{});return()=>{active=false;};},[client,userId,refreshKey]);
 const name=person?.name||displayName||t('Không gian Cơm Nhà'),initials=person?.name?person.name.split(/\s+/).map(p=>p[0]).slice(-2).join('').toLocaleUpperCase('vi'):'CN';
 return <button type="button" className="workspace-label account-button" onClick={onClick} disabled={!userId} aria-label={t('Chỉnh sửa thông tin cá nhân')}><span className="avatar">{initials}</span><span className="account-button-copy"><strong>{name}</strong><small>{person?.affiliation||t(admin?'Người quản lý':'Thành viên')}</small></span><ChevronRight size={16}/></button>;
}
