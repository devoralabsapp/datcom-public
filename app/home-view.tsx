import {loadSource} from '../lib/source';
import {publicWorkspace} from '../lib/meal-client-model';
import RiceApp from './rice-app';
export const dynamic='force-dynamic';
export default async function Home(){return <RiceApp initial={publicWorkspace(await loadSource())}/>;}
