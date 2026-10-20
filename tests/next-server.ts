export class NextResponse extends Response {static json(value:any,init?:ResponseInit){return new Response(JSON.stringify(value),{...init,headers:{'Content-Type':'application/json',...init?.headers}});}}
export const NextRequest=Request;
