import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="bg-background border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center space-x-4">
          <Link href="/" className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            location === "/" ? "text-primary" : "text-muted-foreground"
          )}>
            New Chat
          </Link>
          <Link href="/conversations" className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            location === "/conversations" ? "text-primary" : "text-muted-foreground"
          )}>
            Conversations
          </Link>
          <Link href="/activities" className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            location === "/activities" ? "text-primary" : "text-muted-foreground"
          )}>
            Activities
          </Link>
        </div>
      </div>
    </nav>
  );
}