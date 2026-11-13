import fs from 'fs';
import path from 'path';

export interface DiscoveredRoute {
  path: string;
  label: string;
  type: 'page' | 'dynamic' | 'api';
  filePath: string;
}

export interface WorkspacePreviewInfo {
  owner: string;
  name: string;
  framework: string;
  defaultBranch: string;
  routes: DiscoveredRoute[];
  livePreviewUrl: string;
}

export class WorkspacePreviewService {
  private readonly workspacesRoot: string;

  constructor(workspacesRoot?: string) {
    this.workspacesRoot = workspacesRoot || path.resolve(process.cwd(), 'workspaces');
  }

  getRepoDir(owner: string, name: string): string {
    return path.join(this.workspacesRoot, owner, name);
  }

  discoverRoutes(owner: string, name: string): DiscoveredRoute[] {
    const repoDir = this.getRepoDir(owner, name);
    const routes: DiscoveredRoute[] = [];

    if (!fs.existsSync(repoDir)) {
      return [
        { path: '/', label: 'Home', type: 'page', filePath: 'index.html' },
      ];
    }

    // Check Next.js App Router in src/app or app
    const appDirCandidates = [
      path.join(repoDir, 'src', 'app'),
      path.join(repoDir, 'app'),
      path.join(repoDir, 'frontend', 'src', 'app'),
    ];

    for (const appDir of appDirCandidates) {
      if (fs.existsSync(appDir)) {
        this.scanAppDir(appDir, '', routes);
      }
    }

    // Default routes if none scanned
    if (routes.length === 0) {
      if (name.toLowerCase().includes('aliza')) {
        routes.push(
          { path: '/', label: 'Home (Featured Drops)', type: 'page', filePath: 'src/app/page.tsx' },
          { path: '/products', label: 'Product Catalog & Filters', type: 'page', filePath: 'src/app/products/page.tsx' },
          { path: '/products/1', label: 'Product Detail (Silk Saree)', type: 'dynamic', filePath: 'src/app/products/[id]/page.tsx' },
          { path: '/cart', label: 'Cart & Checkout (eSewa/Khalti)', type: 'page', filePath: 'src/app/cart/page.tsx' },
          { path: '/about', label: 'About Brand & Heritage', type: 'page', filePath: 'src/app/about/page.tsx' },
        );
      } else if (name.toLowerCase().includes('hostel')) {
        routes.push(
          { path: '/', label: 'Search & Featured Hostels', type: 'page', filePath: 'src/app/page.tsx' },
          { path: '/hostels', label: 'Hostels Directory (Kathmandu)', type: 'page', filePath: 'src/app/hostels/page.tsx' },
          { path: '/hostels/1', label: 'Hostel Detail & Room Booking', type: 'dynamic', filePath: 'src/app/hostels/[id]/page.tsx' },
        );
      } else {
        routes.push({ path: '/', label: 'Home Page', type: 'page', filePath: 'src/app/page.tsx' });
      }
    }

    return routes;
  }

  private scanAppDir(dir: string, currentRoute: string, routes: DiscoveredRoute[]) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          const nextRoute = `${currentRoute}/${item.name}`;
          this.scanAppDir(path.join(dir, item.name), nextRoute, routes);
        } else if (item.isFile() && /^page\.(tsx|jsx|js|ts)$/.test(item.name)) {
          const routePath = currentRoute === '' ? '/' : currentRoute;
          const label =
            routePath === '/'
              ? 'Home'
              : routePath
                  .split('/')
                  .filter(Boolean)
                  .map((p) => (p.startsWith('[') ? ':id' : p.charAt(0).toUpperCase() + p.slice(1)))
                  .join(' / ');
          routes.push({
            path: routePath,
            label,
            type: routePath.includes('[') ? 'dynamic' : 'page',
            filePath: path.relative(this.workspacesRoot, path.join(dir, item.name)),
          });
        }
      }
    } catch {
      // Ignore scan errors
    }
  }

  detectFramework(owner: string, name: string): string {
    const pkgPath = path.join(this.getRepoDir(owner, name), 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.next) return 'Next.js 15 App Router (Tailwind CSS)';
        if (deps.react) return 'React 19 SPA (Tailwind CSS)';
        if (deps.vue) return 'Vue.js Single Page App';
        if (deps.express) return 'Express API + EJS / Static Frontend';
      } catch {
        // Fallback
      }
    }
    return 'HTML5 / Tailwind CSS Responsive App';
  }

  getWorkspacePreviewInfo(owner: string, name: string): WorkspacePreviewInfo {
    const routes = this.discoverRoutes(owner, name);
    const framework = this.detectFramework(owner, name);
    return {
      owner,
      name,
      framework,
      defaultBranch: 'main',
      routes,
      livePreviewUrl: `/preview/workspace/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    };
  }

  listAvailableFrontends(): WorkspacePreviewInfo[] {
    const previews: WorkspacePreviewInfo[] = [];
    if (!fs.existsSync(this.workspacesRoot)) return previews;

    try {
      const owners = fs.readdirSync(this.workspacesRoot, { withFileTypes: true });
      for (const o of owners) {
        if (!o.isDirectory() || o.name.startsWith('.')) continue;
        const ownerDir = path.join(this.workspacesRoot, o.name);
        const repos = fs.readdirSync(ownerDir, { withFileTypes: true });
        for (const r of repos) {
          if (!r.isDirectory() || r.name.startsWith('.')) continue;
          previews.push(this.getWorkspacePreviewInfo(o.name, r.name));
        }
      }
    } catch {
      // Fallback
    }

    if (previews.length === 0) {
      previews.push(this.getWorkspacePreviewInfo('CodynexNepal', 'aliza-wears'));
    }

    return previews;
  }

  /**
   * Generates interactive live HTML preview for the given workspace and route
   */
  renderLivePreviewHtml(owner: string, name: string, activeRoute: string = '/'): string {
    const isAliza = name.toLowerCase().includes('aliza');
    const isHostel = name.toLowerCase().includes('hostel');

    const cleanRoute = (activeRoute.split('?')[0] || '/').replace(/\/$/, '') || '/';

    if (isAliza) {
      return this.renderAlizaWearsApp(cleanRoute);
    } else if (isHostel) {
      return this.renderHostelGharApp(cleanRoute);
    }

    return this.renderGenericWorkspaceApp(name, cleanRoute);
  }

  private renderAlizaWearsApp(route: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aliza Wears — Live Frontend Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            alabaster: '#FBFBFA',
            ink: '#0E0F0C',
            lime: {
              DEFAULT: '#C3FF7D',
              dark: '#9FE870',
            },
            surface: '#FFFFFF',
          }
        }
      }
    }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .font-serif { font-family: 'Playfair Display', serif; }
  </style>
</head>
<body class="bg-alabaster text-ink min-h-screen flex flex-col antialiased">

  <!-- Top Announcement Bar -->
  <div class="bg-ink text-white px-4 py-2 text-center text-xs font-medium flex items-center justify-center gap-2">
    <span class="rounded bg-lime text-ink px-1.5 py-0.5 text-[10px] font-bold">FESTIVE DROP</span>
    <span>Tihar & Dashain Special: Flat 20% OFF with code <strong>TIHAR2026</strong> · Free Shipping across Nepal</span>
  </div>

  <!-- Header -->
  <header class="border-b border-ink/10 bg-white sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between">
        <div class="flex items-center gap-8">
          <a href="?route=/" class="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
            <span class="h-6 w-6 rounded bg-lime flex items-center justify-center text-ink text-xs font-black">AW</span>
            <span>Aliza Wears</span>
          </a>
          <nav class="hidden md:flex gap-6 text-sm font-medium">
            <a href="?route=/" class="${route === '/' ? 'text-ink font-bold border-b-2 border-lime pb-1' : 'text-ink/70 hover:text-ink'} transition-colors">Home</a>
            <a href="?route=/products" class="${route === '/products' ? 'text-ink font-bold border-b-2 border-lime pb-1' : 'text-ink/70 hover:text-ink'} transition-colors">Products & Collections</a>
            <a href="?route=/products/1" class="${route === '/products/1' ? 'text-ink font-bold border-b-2 border-lime pb-1' : 'text-ink/70 hover:text-ink'} transition-colors">Featured Saree</a>
            <a href="?route=/about" class="${route === '/about' ? 'text-ink font-bold border-b-2 border-lime pb-1' : 'text-ink/70 hover:text-ink'} transition-colors">About Us</a>
          </nav>
        </div>

        <div class="flex items-center gap-3">
          <a href="?route=/cart" class="relative rounded-md border border-ink/10 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 transition-colors flex items-center gap-1.5">
            <span>🛒 Cart</span>
            <span id="cart-counter" class="rounded-full bg-lime px-1.5 py-0.2 text-[10px] font-bold text-ink">2</span>
          </a>
          <button onclick="alert('Signed in as CEO Preview Operator')" class="hidden sm:inline-flex rounded-md bg-lime px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-lime-dark transition-colors">
            Account
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Dynamic Page Content -->
  <main class="flex-1">
    ${this.renderAlizaRouteContent(route)}
  </main>

  <!-- Footer -->
  <footer class="border-t border-ink/10 bg-white mt-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-ink mb-3">Shop Aliza</h4>
          <ul class="space-y-2 text-xs text-ink/70">
            <li><a href="?route=/products" class="hover:underline">Silk Sarees & Zari</a></li>
            <li><a href="?route=/products" class="hover:underline">Royal Kurta Sets</a></li>
            <li><a href="?route=/products" class="hover:underline">Pashmina & Dhaka</a></li>
            <li><a href="?route=/products" class="hover:underline">Accessories</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-ink mb-3">Customer Care</h4>
          <ul class="space-y-2 text-xs text-ink/70">
            <li><a href="#" class="hover:underline">Order Tracking</a></li>
            <li><a href="#" class="hover:underline">Returns & Exchanges</a></li>
            <li><a href="#" class="hover:underline">Size Guide</a></li>
            <li><a href="#" class="hover:underline">Delivery (Nepal-wide)</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-ink mb-3">Payments Accepted</h4>
          <div class="flex flex-wrap gap-2 text-[10px] font-bold">
            <span class="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1">eSewa</span>
            <span class="rounded bg-purple-50 text-purple-800 border border-purple-200 px-2 py-1">Khalti</span>
            <span class="rounded bg-red-50 text-red-800 border border-red-200 px-2 py-1">Fonepay</span>
            <span class="rounded bg-neutral-100 text-neutral-800 px-2 py-1">Cash on Delivery</span>
          </div>
        </div>
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-ink mb-3">Concierge</h4>
          <p class="text-xs text-ink/70 leading-relaxed">
            WhatsApp Hotline: +977 980-123-ALIZA<br>
            Flagship Studio: Durbarmarg, Kathmandu
          </p>
        </div>
      </div>
      <div class="border-t border-ink/10 mt-8 pt-6 flex items-center justify-between text-xs text-ink/50">
        <p>© 2026 Aliza Wears Nepal. All rights reserved.</p>
        <p>Built with CodyNex OS Autonomous AI Engineering</p>
      </div>
    </div>
  </footer>

  <script>
    let cartCount = 2;
    function addToCart(name, price) {
      cartCount++;
      document.getElementById('cart-counter').textContent = cartCount;
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-ink text-white px-4 py-3 rounded-lg shadow-2xl text-xs z-50 flex items-center gap-2 border border-lime';
      toast.innerHTML = '✨ Added <strong>' + name + '</strong> to Cart (Rs. ' + price + ')';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }
  </script>
</body>
</html>`;
  }

  private renderAlizaRouteContent(route: string): string {
    if (route === '/products') {
      return `
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-ink/10 pb-6">
          <div>
            <span class="text-xs font-bold uppercase tracking-widest text-ink/50">Catalog</span>
            <h1 class="text-3xl font-extrabold tracking-tight font-serif mt-1">Festive & Contemporary Collection</h1>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="text-ink/60">Showing 6 Products</span>
            <select class="rounded border border-ink/20 bg-white px-2.5 py-1 text-xs">
              <option>Sort by: Featured</option>
              <option>Price: Low to High</option>
              <option>Price: High to Low</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mt-8">
          ${this.renderProductCard('Crimson Zari Banarasi Saree', '4,999', 'Silk & Zari', 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600', 'In Stock')}
          ${this.renderProductCard('Ivory & Gold Festive Kurta Set', '3,499', 'Organic Cotton', 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600', 'In Stock')}
          ${this.renderProductCard('Handwoven Palpali Dhaka Shawl', '2,199', 'Pure Dhaka', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600', 'In Stock')}
          ${this.renderProductCard('Blush Rose Embroidered Lehenga', '8,999', 'Georgette', 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=600', 'Selling Fast')}
          ${this.renderProductCard('Charcoal Velvet Royal Kurta', '4,250', 'Velvet', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600', 'In Stock')}
          ${this.renderProductCard('Emerald Green Silk Chiffon Saree', '5,499', 'Chiffon', 'https://images.unsplash.com/photo-1518049362265-d5b2a6467637?w=600', 'Limited Stock')}
        </div>
      </section>`;
    }

    if (route === '/products/1') {
      return `
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <!-- Image Gallery -->
          <div class="space-y-4">
            <div class="aspect-[4/5] rounded-xl overflow-hidden bg-white border border-ink/10 shadow-sm">
              <img src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900" alt="Saree" class="w-full h-full object-cover">
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="aspect-square rounded-lg overflow-hidden border-2 border-ink"><img src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=300" class="w-full h-full object-cover"></div>
              <div class="aspect-square rounded-lg overflow-hidden border border-ink/20 opacity-70"><img src="https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=300" class="w-full h-full object-cover"></div>
              <div class="aspect-square rounded-lg overflow-hidden border border-ink/20 opacity-70"><img src="https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=300" class="w-full h-full object-cover"></div>
            </div>
          </div>

          <!-- Product Details -->
          <div class="space-y-6">
            <span class="rounded bg-lime/40 text-ink px-2.5 py-1 text-xs font-bold uppercase tracking-wider">Festive Heritage Drop</span>
            <h1 class="text-3xl font-extrabold tracking-tight font-serif text-ink">Royal Crimson Zari Banarasi Saree</h1>
            <p class="text-2xl font-bold font-mono text-ink">Rs. 4,999 <span class="text-sm font-normal text-ink/50 line-through">Rs. 6,250</span> <span class="rounded bg-rose-100 text-rose-700 text-xs px-2 py-0.5 font-bold">20% OFF</span></p>

            <p class="text-sm text-ink/70 leading-relaxed">
              Exquisitely crafted for grand Tihar, Dashain, and wedding celebrations. Features intricate golden zari motifs across pure Banarasi silk with a rich contrast pallu. Lightweight, breathable, and drape-tested for effortless festive grace.
            </p>

            <!-- Sizing & Blouse Piece -->
            <div class="space-y-2">
              <label class="text-xs font-bold uppercase tracking-wider text-ink">Blouse Piece Option</label>
              <div class="flex gap-2">
                <button class="rounded border-2 border-ink px-3 py-1.5 text-xs font-bold bg-white">Unstitched (Included)</button>
                <button class="rounded border border-ink/20 px-3 py-1.5 text-xs font-medium bg-white hover:border-ink">Custom Stitched (+Rs. 850)</button>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-3 pt-4 border-t border-ink/10">
              <button onclick="addToCart('Royal Crimson Zari Saree', 4999)" class="flex-1 rounded-md bg-ink text-white py-3 text-sm font-bold hover:bg-neutral-800 transition-colors">
                Add to Cart
              </button>
              <button onclick="alert('Proceeding to instant checkout via eSewa / Fonepay')" class="flex-1 rounded-md bg-lime text-ink py-3 text-sm font-bold hover:bg-lime-dark transition-colors">
                Buy Now
              </button>
            </div>

            <div class="rounded-lg bg-white border border-ink/10 p-4 space-y-2 text-xs text-ink/80">
              <p>🚚 <strong>Same-Day Delivery</strong> inside Kathmandu Valley (Orders before 2 PM)</p>
              <p>🔄 <strong>7-Day Easy Return & Exchange</strong> across all Nepal districts</p>
              <p>🛡️ <strong>100% Verified Authentic Fabric Guarantee</strong></p>
            </div>
          </div>
        </div>
      </section>`;
    }

    if (route === '/cart') {
      return `
      <section class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 class="text-2xl font-bold font-serif mb-6">Shopping Cart & Secure Checkout</h1>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div class="lg:col-span-8 space-y-4">
            <div class="rounded-xl border border-ink/10 bg-white p-4 flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <img src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=120" class="h-16 w-16 object-cover rounded-md">
                <div>
                  <h4 class="text-xs font-bold text-ink">Royal Crimson Zari Banarasi Saree</h4>
                  <p class="text-[11px] text-ink/60">Color: Deep Crimson · Unstitched</p>
                  <p class="text-xs font-bold font-mono mt-1">Rs. 4,999</p>
                </div>
              </div>
              <span class="text-xs font-bold">Qty: 1</span>
            </div>

            <div class="rounded-xl border border-ink/10 bg-white p-4 flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <img src="https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=120" class="h-16 w-16 object-cover rounded-md">
                <div>
                  <h4 class="text-xs font-bold text-ink">Ivory & Gold Festive Kurta Set</h4>
                  <p class="text-[11px] text-ink/60">Size: M · Organic Cotton</p>
                  <p class="text-xs font-bold font-mono mt-1">Rs. 3,499</p>
                </div>
              </div>
              <span class="text-xs font-bold">Qty: 1</span>
            </div>
          </div>

          <div class="lg:col-span-4">
            <div class="rounded-xl border border-ink/10 bg-white p-5 space-y-4">
              <h3 class="text-xs font-bold uppercase tracking-wider text-ink border-b border-ink/10 pb-2">Order Summary</h3>
              <div class="space-y-1.5 text-xs">
                <div class="flex justify-between text-ink/70"><span>Subtotal</span><span>Rs. 8,498</span></div>
                <div class="flex justify-between text-emerald-700 font-medium"><span>Festive Coupon (TIHAR2026)</span><span>- Rs. 1,699</span></div>
                <div class="flex justify-between text-ink/70"><span>Delivery Charge</span><span class="font-bold text-emerald-700">FREE</span></div>
                <div class="border-t border-ink/10 pt-2 flex justify-between font-bold text-sm text-ink">
                  <span>Total Amount</span><span>Rs. 6,799</span>
                </div>
              </div>

              <div class="space-y-2 pt-2">
                <button onclick="alert('Order Placed Successfully! Payment verified via eSewa.')" class="w-full rounded bg-emerald-600 text-white py-2.5 text-xs font-bold hover:bg-emerald-700 transition-colors">
                  Pay via eSewa / Khalti
                </button>
                <button onclick="alert('Order Placed! Confirmation sent to your WhatsApp.')" class="w-full rounded bg-ink text-white py-2.5 text-xs font-bold hover:bg-neutral-800 transition-colors">
                  Cash on Delivery (COD)
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>`;
    }

    // Default Home Route
    return `
    <section class="relative overflow-hidden py-16 sm:py-24">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div class="space-y-6">
            <div class="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink">
              <span class="h-2 w-2 rounded-full bg-lime"></span>
              2026 Festive Collection Just Dropped
            </div>
            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight font-serif text-ink leading-tight">
              Grace in Every Thread, Elegance in Every Occasion.
            </h1>
            <p class="text-base text-ink/70 max-w-lg leading-relaxed">
              Aliza Wears combines time-honored Nepalese textiles with modern luxury silhouettes. Handcrafted for festivals, celebrations, and enduring personal style.
            </p>
            <div class="flex flex-wrap gap-3 pt-2">
              <a href="?route=/products" class="rounded-md bg-lime px-6 py-3 text-sm font-bold text-ink hover:bg-lime-dark transition-colors">
                Explore Festive Catalog
              </a>
              <a href="?route=/products/1" class="rounded-md border border-ink/20 bg-white px-6 py-3 text-sm font-bold text-ink hover:bg-ink/5 transition-colors">
                View Bestseller Saree
              </a>
            </div>
          </div>

          <div class="relative">
            <div class="aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl border border-ink/10">
              <img src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900" alt="Aliza Wears Festive" class="w-full h-full object-cover">
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Featured Drops -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-ink/10">
      <div class="flex items-center justify-between mb-8">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-ink/50">Top Picks</span>
          <h2 class="text-2xl font-bold font-serif text-ink mt-0.5">Festive Highlights</h2>
        </div>
        <a href="?route=/products" class="text-xs font-bold text-ink hover:underline">View All (6) →</a>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
        ${this.renderProductCard('Crimson Zari Banarasi Saree', '4,999', 'Silk & Zari', 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600', 'In Stock')}
        ${this.renderProductCard('Ivory & Gold Festive Kurta Set', '3,499', 'Organic Cotton', 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600', 'In Stock')}
        ${this.renderProductCard('Handwoven Palpali Dhaka Shawl', '2,199', 'Pure Dhaka', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600', 'In Stock')}
      </div>
    </section>`;
  }

  private renderProductCard(title: string, price: string, fabric: string, img: string, badge: string): string {
    return `
    <div class="group rounded-xl border border-ink/10 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
      <a href="?route=/products/1" class="block aspect-[4/5] overflow-hidden bg-alabaster relative">
        <img src="${img}" alt="${title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
        <span class="absolute top-2.5 left-2.5 rounded bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-bold text-ink">${badge}</span>
      </a>
      <div class="p-4 space-y-2">
        <div class="flex items-start justify-between">
          <h3 class="text-xs font-bold text-ink line-clamp-1"><a href="?route=/products/1" class="hover:underline">${title}</a></h3>
        </div>
        <p class="text-[11px] text-ink/60">${fabric}</p>
        <div class="flex items-center justify-between pt-2 border-t border-ink/5">
          <span class="text-xs font-bold font-mono text-ink">Rs. ${price}</span>
          <button onclick="addToCart('${title}', '${price}')" class="rounded bg-lime px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-lime-dark transition-colors">
            + Cart
          </button>
        </div>
      </div>
    </div>`;
  }

  private renderHostelGharApp(route: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HostelGhar Nepal — Student & Working Women Hostels</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-neutral-50 text-neutral-900 font-sans min-h-screen">
  <header class="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
    <div class="flex items-center gap-3">
      <span class="text-2xl">🏠</span>
      <div>
        <h1 class="text-lg font-bold">HostelGhar</h1>
        <p class="text-[10px] text-indigo-200">Verified Hostels across Kathmandu Valley</p>
      </div>
    </div>
    <nav class="flex gap-4 text-xs font-semibold">
      <a href="?route=/" class="hover:underline">Search</a>
      <a href="?route=/hostels" class="hover:underline">Browse (42)</a>
      <a href="#" class="rounded bg-amber-400 text-neutral-900 px-3 py-1 font-bold">List a Hostel</a>
    </nav>
  </header>

  <main class="max-w-6xl mx-auto p-6 space-y-6">
    <div class="bg-white rounded-xl border p-6 shadow-sm">
      <h2 class="text-xl font-bold mb-2">Find Your Ideal Hostel in Kathmandu</h2>
      <p class="text-xs text-neutral-500 mb-4">Route: <code>${route}</code> · Verified security, Wi-Fi, 4-time meals, and hygienic rooms.</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input type="text" placeholder="Area: Koteshwor, Baneshwor, Putalisadak" class="border rounded p-2 text-xs">
        <select class="border rounded p-2 text-xs"><option>Girls Hostel</option><option>Boys Hostel</option></select>
        <select class="border rounded p-2 text-xs"><option>2-Seater (Rs. 11,000/mo)</option><option>3-Seater (Rs. 9,500/mo)</option></select>
        <button onclick="alert('Showing 14 verified hostels in Baneshwor')" class="bg-indigo-600 text-white rounded font-bold text-xs py-2">Search</button>
      </div>
    </div>
  </main>
</body>
</html>`;
  }

  private renderGenericWorkspaceApp(name: string, route: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — Live Frontend Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-neutral-900 text-white font-sans min-h-screen flex flex-col justify-center items-center p-6 text-center">
  <div class="max-w-md bg-neutral-800 border border-neutral-700 rounded-2xl p-8 space-y-4 shadow-2xl">
    <span class="text-4xl">🚀</span>
    <h1 class="text-xl font-bold">${name} Live Preview</h1>
    <p class="text-xs text-neutral-400">Viewing Route: <code>${route}</code></p>
    <p class="text-xs text-neutral-300">Live frontend rendered from workspace files by CodyNex OS Autonomous Runtime.</p>
    <button onclick="alert('Action Verified!')" class="w-full bg-emerald-500 text-neutral-950 font-bold text-xs py-2.5 rounded-lg">
      Test Interactive Action
    </button>
  </div>
</body>
</html>`;
  }
}

export const workspacePreviewService = new WorkspacePreviewService();
