export function appleTransactionHosts(environment = "") {
 const hosts = [
  {environment:"Production",base:"https://api.storekit.apple.com"},
  {environment:"Sandbox",base:"https://api.storekit-sandbox.apple.com"}
 ];
 if (!environment) return hosts;
 if (!["Production","Sandbox"].includes(environment)) throw new Error("Invalid Apple billing environment.");
 return hosts.filter(host=>host.environment===environment);
}

export async function lookupAppleTransaction({token,id,hosts,fetchImpl=fetch}) {
 let lastError;
 for (const host of hosts) {
  const response=await fetchImpl(`${host.base}/inApps/v1/transactions/${id}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(response.ok&&data.signedTransactionInfo)return {...host,data};
  if(response.status===401){lastError=new Error('Apple server billing credentials were rejected.');continue;}
  if(response.status===404){lastError=new Error(`Apple transaction was not found in ${host.environment}.`);continue;}
  throw new Error(data.errorMessage||data.error||`Apple transaction verification failed (HTTP ${response.status}).`);
 }
 throw lastError||new Error('Apple transaction could not be verified.');
}
