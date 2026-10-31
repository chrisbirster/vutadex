import { createHmac, createHash } from 'node:crypto';

/** The SES v2 HTTPS transport uses SigV4. No AWS client or secret enters the browser bundle. */
export type MailConfig = {
  region: string; from: string; accessKeyId: string; secretAccessKey: string;
  sessionToken?: string; endpoint?: string;
};
export function mailConfig(env:NodeJS.ProcessEnv):MailConfig {
  const region=env.AWS_REGION||'';
  const from=env.SES_FROM_EMAIL||'';
  const accessKeyId=env.AWS_ACCESS_KEY_ID||'';
  const secretAccessKey=env.AWS_SECRET_ACCESS_KEY||'';
  if(!/^[a-z]{2}-[a-z-]+-\d$/.test(region)||!from.includes('@')||!accessKeyId||!secretAccessKey)
    throw new Error('SES sender, AWS region, and AWS credentials must be configured');
  return {region,from,accessKeyId,secretAccessKey,sessionToken:env.AWS_SESSION_TOKEN};
}
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const mac=(key:Buffer|string,value:string)=>createHmac('sha256',key).update(value).digest();
export function signedSesRequest(config:MailConfig,to:string,link:string,date=new Date()){
  const dateTime=date.toISOString().replace(/[-:]|\.\d{3}/g,'');
  const dateStamp=dateTime.slice(0,8);
  const host='email.'+config.region+'.amazonaws.com';
  const body=JSON.stringify({
    FromEmailAddress:config.from,
    Destination:{ToAddresses:[to]},
    Content:{Simple:{Subject:{Data:'Your Vutadex sign-in link',Charset:'UTF-8'},
      Body:{Text:{Data:'Sign in to Vutadex using this link:\n'+link+'\n\nThis link expires in 15 minutes. If you did not request it, ignore this message.',Charset:'UTF-8'}}}}
  });
  const payloadHash=sha(body);
  const headers:Record<string,string>={
    'content-type':'application/json',
    'host':host,
    'x-amz-content-sha256':payloadHash,
    'x-amz-date':dateTime
  };
  if(config.sessionToken)headers['x-amz-security-token']=config.sessionToken;
  const keys=Object.keys(headers).sort();
  const signedHeaders=keys.join(';');
  const canonical=keys.map(key=>key+':'+headers[key]!.trim()+'\n').join('');
  const request=['POST','/v2/email/outbound-emails','',canonical,signedHeaders,payloadHash].join('\n');
  const scope=[dateStamp,config.region,'ses','aws4_request'].join('/');
  const stringToSign=['AWS4-HMAC-SHA256',dateTime,scope,sha(request)].join('\n');
  const key=mac(mac(mac(mac('AWS4'+config.secretAccessKey,dateStamp),config.region),'ses'),'aws4_request');
  const signature=createHmac('sha256',key).update(stringToSign).digest('hex');
  return {
    url:'https://'+host+'/v2/email/outbound-emails',
    headers:{...headers,authorization:'AWS4-HMAC-SHA256 Credential='+config.accessKeyId+'/'+scope+', SignedHeaders='+signedHeaders+', Signature='+signature} as Record<string,string>,
    body
  };
}
export async function sendViaSes(config:MailConfig,to:string,link:string):Promise<void>{
  const req=signedSesRequest(config,to,link);
  const response=await fetch(req.url,{method:'POST',headers:req.headers,body:req.body,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('SES refused the email delivery request ('+response.status+')');
}
