const fs = require('fs');

const styleToTailwind = {
  'display: "flex"': 'flex',
  'flexDirection: "column"': 'flex-col',
  'alignItems: "center"': 'items-center',
  'alignItems: "flex-end"': 'items-end',
  'justifyContent: "space-between"': 'justify-between',
  'justifyContent: "center"': 'justify-center',
  'gap: "0.25rem"': 'gap-1',
  'gap: "0.5rem"': 'gap-2',
  'gap: "0.75rem"': 'gap-3',
  'gap: "1rem"': 'gap-4',
  'gap: "4px"': 'gap-1',
  'gap: "8px"': 'gap-2',
  'gap: "12px"': 'gap-3',
  'marginBottom: "0.25rem"': 'mb-1',
  'marginBottom: "0.5rem"': 'mb-2',
  'marginBottom: "0.75rem"': 'mb-3',
  'marginBottom: "1rem"': 'mb-4',
  'marginBottom: "8px"': 'mb-2',
  'marginTop: "0.25rem"': 'mt-1',
  'marginTop: "0.5rem"': 'mt-2',
  'marginTop: "1rem"': 'mt-4',
  'marginTop: "1.5rem"': 'mt-6',
  'marginTop: "8px"': 'mt-2',
  'padding: "0"': 'p-0',
  'padding: "0.25rem"': 'p-1',
  'padding: "0.5rem"': 'p-2',
  'padding: "1rem"': 'p-4',
  'padding: "1.25rem"': 'p-5',
  'padding: "1.5rem"': 'p-6',
  'padding: "1rem 1.5rem 0"': 'pt-4 px-6',
  'padding: "1.5rem 1rem 0"': 'pt-6 px-4',
  'padding: "0.75rem"': 'p-3',
  'padding: "4px 8px"': 'px-2 py-1',
  'padding: "8px 12px"': 'px-3 py-2',
  'fontSize: "0.7rem"': 'text-[0.7rem]',
  'fontSize: "0.75rem"': 'text-xs',
  'fontSize: "0.875rem"': 'text-sm',
  'fontSize: "0.9375rem"': 'text-[0.9375rem]',
  'fontSize: "1rem"': 'text-base',
  'fontSize: "1.25rem"': 'text-xl',
  'fontSize: "1.5rem"': 'text-2xl',
  'fontSize: "1.75rem"': 'text-3xl',
  'fontSize: "2rem"': 'text-4xl',
  'fontSize: "2.5rem"': 'text-5xl',
  'fontWeight: 500': 'font-medium',
  'fontWeight: 600': 'font-semibold',
  'fontWeight: 700': 'font-bold',
  'fontWeight: 800': 'font-extrabold',
  'fontWeight: 900': 'font-black',
  'textAlign: "center"': 'text-center',
  'textAlign: "right"': 'text-right',
  'color: "rgba(255,255,255,0.9)"': 'text-white/90',
  'color: "rgba(255,255,255,0.6)"': 'text-white/60',
  'color: "#fff"': 'text-white',
  'color: "white"': 'text-white',
  'color: "#f59e0b"': 'text-amber-500',
  'color: "#b45309"': 'text-amber-700',
  'color: "#fcd34d"': 'text-amber-300',
  'color: "var(--primary)"': 'text-primary',
  'color: "var(--text-muted)"': 'text-muted-foreground',
  'color: "var(--text-secondary)"': 'text-secondary-foreground',
  'background: "var(--white)"': 'bg-white',
  'background: "var(--primary)"': 'bg-primary',
  'backgroundColor: "var(--primary)"': 'bg-primary',
  'borderRadius: "50%"': 'rounded-full',
  'borderRadius: "4px"': 'rounded',
  'borderRadius: "6px"': 'rounded-md',
  'borderRadius: "8px"': 'rounded-lg',
  'borderRadius: "12px"': 'rounded-xl',
  'borderRadius: "6px 6px 0 0"': 'rounded-t-md',
  'fontFamily: "monospace"': 'font-mono',
  'overflow: "hidden"': 'overflow-hidden',
  'textOverflow: "ellipsis"': 'truncate',
  'whiteSpace: "nowrap"': 'whitespace-nowrap',
  'textTransform: "uppercase"': 'uppercase',
  'border: "none"': 'border-none',
  'textDecoration: "none"': 'no-underline',
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let match;
  
  // A simplistic regex to find style={{...}}
  const styleRegex = /style={{([^}]+)}}/g;
  
  content = content.replace(styleRegex, (match, inner) => {
    // Keep a list of unconvertible styles to leave in style={{...}}
    const unconvertible = [];
    const tailwindClasses = [];
    
    // Split by comma, but be careful with functions or complex things.
    // In our case, the styles are fairly simple like `background: "...", color: cfg.color`
    const pairs = inner.split(',').map(s => s.trim());
    
    for (let pair of pairs) {
      if (!pair) continue;
      
      let mapped = false;
      // Exact match
      for (const [key, val] of Object.entries(styleToTailwind)) {
        if (pair === key) {
          tailwindClasses.push(val);
          mapped = true;
          break;
        }
      }
      
      if (!mapped) {
        // Try dynamic parsing
        if (pair.startsWith('width:') || pair.startsWith('height:') || pair.startsWith('flex:') || pair.startsWith('background:') || pair.startsWith('border:') || pair.includes('cfg') || pair.includes('?')) {
           unconvertible.push(pair);
        } else {
           unconvertible.push(pair);
        }
      }
    }
    
    let res = "";
    if (tailwindClasses.length > 0) {
      res += ` className="${tailwindClasses.join(' ')}"`;
    }
    if (unconvertible.length > 0) {
      if (res) res += " ";
      res += `style={{ ${unconvertible.join(', ')} }}`;
    }
    
    return res;
  });
  
  // Merge multiple className attributes if they exist
  // e.g. className="foo" className="bar" -> className="foo bar"
  content = content.replace(/className="([^"]+)"\s+className="([^"]+)"/g, 'className="$1 $2"');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Processed ${filePath}`);
}

processFile('app/technician/dashboard/AvailableTickets.tsx');

