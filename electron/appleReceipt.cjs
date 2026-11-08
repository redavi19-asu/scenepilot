// Receipt contents are untrusted hints. Only the backend's Apple verification grants access.
function fields(buffer){
 const out=[];let i=0;
 while(i<buffer.length){
  const tag=buffer[i++];if(i>=buffer.length)throw Error('Truncated receipt');
  let size=buffer[i++];
  if(size&128){const count=size&127;if(!count||count>4||i+count>buffer.length)throw Error('Invalid receipt length');size=0;for(let j=0;j<count;j++)size=size*256+buffer[i++];}
  if(i+size>buffer.length)throw Error('Truncated receipt value');out.push({tag,data:buffer.subarray(i,i+size)});i+=size;
 }
 return out;
}
const inner=buffer=>fields(buffer)[0]?.data;
function attributes(buffer){return fields(inner(buffer)).map(({data})=>{const f=fields(data);return {type:f[0].data.readUIntBE(0,f[0].data.length),data:f[2].data};});}
function receiptTransactions(buffer,product){
 try{
  if(buffer.length>4*1024*1024)return [];
  const contentInfo=fields(inner(buffer));const signed=fields(inner(contentInfo[1].data));
  const encapsulated=fields(signed[2].data);const payload=inner(encapsulated[1].data);
  const ids=[];
  for(const attribute of attributes(payload)){
   if(attribute.type!==17)continue;
   const purchase=new Map(attributes(attribute.data).map(v=>[v.type,inner(v.data)?.toString('utf8')]));
   if(purchase.get(1702)!==product)continue;
   for(const type of [1703,1705]){const id=purchase.get(type);if(/^\d{4,40}$/.test(id||'')&&!ids.includes(id))ids.push(id);}
  }
  return ids.reverse();
 }catch{return [];}
}
module.exports={receiptTransactions};
