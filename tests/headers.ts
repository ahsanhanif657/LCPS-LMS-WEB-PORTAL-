const values=new Map<string,string>();
export const jar={get:(key:string)=>values.has(key)?{value:values.get(key)!}:undefined,set:(key:string,value:string,options?:any)=>{if(options?.maxAge===0)values.delete(key);else values.set(key,value);}};
export async function cookies(){return jar;}

export async function headers(){return new Headers({'host':'portal.test'});}
