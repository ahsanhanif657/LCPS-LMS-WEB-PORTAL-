import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'LCPS · Academic Portal',description:'Your learning, connected. Lahore College of Pharmaceutical Sciences academic portal.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
