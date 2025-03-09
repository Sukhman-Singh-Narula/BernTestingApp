import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="bg-background border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center space-x-4">
          <Link href="/">
            <a className={cn(
              "text-sm font-medium transition-colors hover:text-primary",
              location === "/" ? "text-primary" : "text-muted-foreground"
            )}>
              Welcome
            </a>
          </Link>
          <Link href="/chat">
            <a className={cn(
              "text-sm font-medium transition-colors hover:text-primary",
              location === "/chat" ? "text-primary" : "text-muted-foreground"
            )}>
              Chat
            </a>
          </Link>
          <Link href="/activities">
            <a className={cn(
              "text-sm font-medium transition-colors hover:text-primary",
              location === "/activities" ? "text-primary" : "text-muted-foreground"
            )}>
              Activities
            </a>
          </Link>
        </div>
      </div>
    </nav>
  );
}
