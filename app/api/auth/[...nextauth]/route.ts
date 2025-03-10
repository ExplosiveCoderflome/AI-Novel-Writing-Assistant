import NextAuth from "next-auth/next";
import { authOptions } from "../options";

// 创建处理程序
const handler = NextAuth(authOptions);

// 仅导出HTTP方法处理程序
export { handler as GET, handler as POST }; 