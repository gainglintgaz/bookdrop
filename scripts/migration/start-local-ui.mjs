import { fileURLToPath, pathToFileURL } from 'node:url';

export function localUiOptions(env) {
  let origin;try{origin=new URL(env.BOOKDROP_LOCAL_ORIGIN??'http://127.0.0.1:5173');}catch{throw new Error('LOCAL_UI_CONFIGURATION_REQUIRED');}
  const apiPort=Number(env.BOOKDROP_LOCAL_API_PORT??8788);
  if(origin.protocol!=='http:' || origin.hostname!=='127.0.0.1' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash || !origin.port || Number(origin.port)<1024 || !Number.isInteger(apiPort) || apiPort<1024 || apiPort>65535 || apiPort===Number(origin.port))throw new Error('LOCAL_UI_CONFIGURATION_REQUIRED');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  return {root,configFile:false,envFile:false,envDir:false,server:{host:'127.0.0.1',port:Number(origin.port),strictPort:true,cors:false,allowedHosts:['127.0.0.1'],fs:{strict:true,allow:[root],deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/credentials*','**/secrets*']},proxy:{'^/api/bookdrop/':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:false,ws:false}}}};
}
export async function startLocalUi(env) {
    const options=localUiOptions(env);
    for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];
    process.env.VITE_MODE='local';
    process.env.NODE_ENV='development';
    const [{createServer},{default:react},{default:tailwind},{default:path}]=await Promise.all([import('vite'),import('@vitejs/plugin-react'),import('@tailwindcss/vite'),import('node:path')]);
    const server=await createServer({...options,plugins:[react(),tailwind()],resolve:{alias:{'@':path.join(options.root,'src')}}});
    try {
      await server.listen();
      // Listening alone does not mean the initial application imports are ready.
      if(!await server.environments.client.transformRequest('/src/main.tsx'))throw new Error('LOCAL_UI_ENTRY_UNAVAILABLE');
      await server.environments.client.waitForRequestsIdle();
      return server;
    }catch(error){await server.close();throw error;}
}
async function main() {
  try {
    const server=await startLocalUi(process.env);console.log('LOCAL_UI_READY');
    let closing=false;const close=async()=>{if(closing)return;closing=true;try{await server.close();}catch{console.error('LOCAL_UI_SHUTDOWN_FAILED');process.exitCode=1;}};
    process.once('SIGINT',close);process.once('SIGTERM',close);
  } catch {console.error('LOCAL_UI_STARTUP_FAILED');process.exitCode=1;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await main();
