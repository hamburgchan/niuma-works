import "@fontsource/press-start-2p/latin-400.css";
import "@rainbow-me/rainbowkit/styles.css";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "牛马人才市场 · NIUMA WORKS",
  description: "三头老牛马培养纸片新员工。在 Monad 测试网招聘、验收、分账；雇它上一班，给老板发工资。",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="zh-CN" data-type="software" data-radius="sharp" suppressHydrationWarning>
      <body>
        <ThemeProvider forcedTheme="light" enableSystem={false}>
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
