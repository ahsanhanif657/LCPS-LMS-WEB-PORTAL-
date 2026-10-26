import {securityHeaders} from './security/headers.mjs';
/** @type {import('next').NextConfig} */
export default {poweredByHeader:false,reactStrictMode:true,serverExternalPackages:['postgres','@libsql/client'],async redirects(){return [{source:'/lcps-logo.jpg',destination:'/lcps-logo.png',permanent:true}];},async headers(){return [{source:'/(.*)',headers:securityHeaders},{source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]}];}};
