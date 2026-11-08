export async function renewReviewerAccess(db, now=Date.now()) {
  const reviewer=await db.prepare("SELECT id FROM users WHERE email='appreview@icomputeranything.com' AND role='user' AND status='active'").first();
  if(!reviewer)throw new Error('The existing reviewer account is unavailable.');
  const expiresAt=now+45*24*60*60*1000;
  const result=await db.prepare("UPDATE user_products SET plan='pro',access_status='active',expires_at=? WHERE user_id=? AND product_id='product_scenepilot' AND source='app-review'").bind(expiresAt,reviewer.id).run();
  if(Number(result?.meta?.changes)!==1)throw new Error('The existing reviewer entitlement is unavailable.');
  return {ok:true,expiresAt};
}
