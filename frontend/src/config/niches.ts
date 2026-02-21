/**
 * Niche configuration — defines per-business-type labels, icons, and product types.
 * Used by Sidebar, Layout header, Products form, and Customers page.
 */

export interface NicheConfig {
  emoji: string
  label: string              // business type display name
  productsLabel: string      // "Rooms" / "Menu" / "Catalog" / "Services" etc.
  ordersLabel: string        // "Reservations" / "Orders" / "Appointments" etc.
  customersLabel: string     // "Guests" / "Patients" / "Clients" etc.
  broadcastsLabel: string    // "Campaigns" / "Promotions" etc.
  productTypes: { value: string; label: string }[]
  productUnits: string[]
  newProductLabel: string    // "Add Room" / "Add Menu Item" / "Add Product"
  offerKeyword: string       // WhatsApp keyword for offers
  catalogKeyword: string     // WhatsApp keyword for catalog
}

export const NICHE_CONFIG: Record<string, NicheConfig> = {
  hotel: {
    emoji: '🏨',
    label: 'Hotel / Guest House',
    productsLabel: 'Rooms & Services',
    ordersLabel: 'Reservations',
    customersLabel: 'Guests',
    broadcastsLabel: 'Promotions',
    productTypes: [
      { value: 'room',      label: '🛏️ Room / Suite' },
      { value: 'package',   label: '📦 Stay Package' },
      { value: 'service',   label: '🍽️ Hotel Service' },
      { value: 'amenity',   label: '🏊 Amenity' },
    ],
    productUnits: ['night', 'night/person', 'per stay', 'hour'],
    newProductLabel: 'Add Room / Service',
    offerKeyword: 'OFFERS',
    catalogKeyword: 'ROOMS',
  },
  restaurant: {
    emoji: '🍽️',
    label: 'Restaurant / Food',
    productsLabel: 'Menu Items',
    ordersLabel: 'Food Orders',
    customersLabel: 'Diners',
    broadcastsLabel: 'Daily Specials',
    productTypes: [
      { value: 'menu_item', label: '🍛 Main Course' },
      { value: 'combo',     label: '🍱 Combo Meal' },
      { value: 'beverage',  label: '🥤 Beverage' },
      { value: 'dessert',   label: '🍰 Dessert / Snack' },
      { value: 'starter',   label: '🥗 Starter' },
    ],
    productUnits: ['plate', 'piece', 'glass', 'bowl', 'half', 'full'],
    newProductLabel: 'Add Menu Item',
    offerKeyword: 'OFFERS',
    catalogKeyword: 'MENU',
  },
  grocery: {
    emoji: '🛒',
    label: 'Grocery / Supermarket',
    productsLabel: 'Product Catalog',
    ordersLabel: 'Orders',
    customersLabel: 'Shoppers',
    broadcastsLabel: 'Daily Deals',
    productTypes: [
      { value: 'product',   label: '📦 Grocery Item' },
      { value: 'bundle',    label: '🎁 Bundle / Combo Pack' },
      { value: 'produce',   label: '🥦 Fresh Produce' },
    ],
    productUnits: ['kg', 'gram', 'liter', 'ml', 'piece', 'dozen', 'pack', 'box'],
    newProductLabel: 'Add Product',
    offerKeyword: 'DEALS',
    catalogKeyword: 'CATALOG',
  },
  retail: {
    emoji: '🏪',
    label: 'Retail / Clothing / E-commerce',
    productsLabel: 'Product Catalog',
    ordersLabel: 'Orders',
    customersLabel: 'Customers',
    broadcastsLabel: 'Promotions',
    productTypes: [
      { value: 'product',   label: '👗 Clothing / Apparel' },
      { value: 'accessory', label: '👜 Accessory' },
      { value: 'saree',     label: '🥻 Saree / Ethnic Wear' },
      { value: 'footwear',  label: '👟 Footwear' },
      { value: 'gift',      label: '🎁 Gift Item' },
    ],
    productUnits: ['piece', 'set', 'pair', 'meter', 'yard'],
    newProductLabel: 'Add Product',
    offerKeyword: 'OFFERS',
    catalogKeyword: 'CATALOG',
  },
  clinic: {
    emoji: '🏥',
    label: 'Clinic / Healthcare',
    productsLabel: 'Services & Packages',
    ordersLabel: 'Appointments',
    customersLabel: 'Patients',
    broadcastsLabel: 'Health Campaigns',
    productTypes: [
      { value: 'service',      label: '🩺 Consultation' },
      { value: 'test',         label: '🧪 Lab Test / Scan' },
      { value: 'package',      label: '📋 Health Package' },
      { value: 'procedure',    label: '💊 Procedure / Treatment' },
    ],
    productUnits: ['session', 'visit', 'course', 'test', 'package'],
    newProductLabel: 'Add Service / Package',
    offerKeyword: 'OFFERS',
    catalogKeyword: 'SERVICES',
  },
  salon: {
    emoji: '💅',
    label: 'Salon / Spa / Beauty',
    productsLabel: 'Services & Packages',
    ordersLabel: 'Appointments',
    customersLabel: 'Clients',
    broadcastsLabel: 'Beauty Deals',
    productTypes: [
      { value: 'service',   label: '✂️ Hair Service' },
      { value: 'spa',       label: '💆 Spa / Massage' },
      { value: 'nail',      label: '💅 Nail Art' },
      { value: 'package',   label: '✨ Beauty Package' },
      { value: 'skincare',  label: '🧴 Skin Treatment' },
    ],
    productUnits: ['session', 'hour', 'sitting', 'course'],
    newProductLabel: 'Add Service',
    offerKeyword: 'OFFERS',
    catalogKeyword: 'SERVICES',
  },
  real_estate: {
    emoji: '🏠',
    label: 'Real Estate / Property',
    productsLabel: 'Property Listings',
    ordersLabel: 'Site Visit Requests',
    customersLabel: 'Leads',
    broadcastsLabel: 'Property Alerts',
    productTypes: [
      { value: 'property',    label: '🏠 Residential (Flat/Villa)' },
      { value: 'plot',        label: '📐 Plot / Land' },
      { value: 'commercial',  label: '🏢 Commercial Space' },
      { value: 'rental',      label: '🔑 Rental Property' },
      { value: 'pg',          label: '🛏️ PG / Hostel' },
    ],
    productUnits: ['sqft', 'sqm', 'BHK', 'acre', 'unit'],
    newProductLabel: 'Add Property',
    offerKeyword: 'PRICING',
    catalogKeyword: 'PROPERTIES',
  },
  agency_travel: {
    emoji: '✈️',
    label: 'Travel Agency',
    productsLabel: 'Tour Packages',
    ordersLabel: 'Bookings',
    customersLabel: 'Travellers',
    broadcastsLabel: 'Travel Deals',
    productTypes: [
      { value: 'package',   label: '✈️ Tour Package' },
      { value: 'domestic',  label: '🗺️ Domestic Tour' },
      { value: 'international', label: '🌍 International Tour' },
      { value: 'honeymoon', label: '💑 Honeymoon Package' },
      { value: 'pilgrimage',label: '🛕 Pilgrimage Tour' },
      { value: 'visa',      label: '📄 Visa Service' },
    ],
    productUnits: ['person', 'couple', 'group', 'night', 'day'],
    newProductLabel: 'Add Package',
    offerKeyword: 'PACKAGES',
    catalogKeyword: 'PACKAGES',
  },
  agency_recruitment: {
    emoji: '💼',
    label: 'Recruitment Agency',
    productsLabel: 'Job Openings',
    ordersLabel: 'Applications',
    customersLabel: 'Candidates',
    broadcastsLabel: 'Job Alerts',
    productTypes: [
      { value: 'job',         label: '💼 Full-time Job' },
      { value: 'part_time',   label: '⏰ Part-time Job' },
      { value: 'internship',  label: '📚 Internship' },
      { value: 'contract',    label: '📄 Contract Role' },
      { value: 'fresher',     label: '🎓 Fresher Opening' },
    ],
    productUnits: ['opening', 'vacancy', 'position'],
    newProductLabel: 'Add Job Opening',
    offerKeyword: 'JOBS',
    catalogKeyword: 'JOBS',
  },
  wholesaler: {
    emoji: '📦',
    label: 'Wholesaler / Distributor',
    productsLabel: 'Product Catalog',
    ordersLabel: 'Bulk Orders',
    customersLabel: 'Buyers',
    broadcastsLabel: 'Trade Offers',
    productTypes: [
      { value: 'product',   label: '📦 Wholesale Product' },
      { value: 'bundle',    label: '🎁 Bulk Bundle' },
      { value: 'clearance', label: '🏷️ Clearance Stock' },
    ],
    productUnits: ['case', 'box', 'carton', 'pallet', 'kg', 'dozen', 'gross'],
    newProductLabel: 'Add Product',
    offerKeyword: 'DEALS',
    catalogKeyword: 'CATALOG',
  },
  general: {
    emoji: '🏢',
    label: 'General Business',
    productsLabel: 'Products & Services',
    ordersLabel: 'Orders',
    customersLabel: 'Customers',
    broadcastsLabel: 'Campaigns',
    productTypes: [
      { value: 'product',   label: '📦 Product' },
      { value: 'service',   label: '🔧 Service' },
      { value: 'package',   label: '🎁 Package' },
    ],
    productUnits: ['piece', 'unit', 'hour', 'day', 'month'],
    newProductLabel: 'Add Product / Service',
    offerKeyword: 'OFFERS',
    catalogKeyword: 'CATALOG',
  },
}

export function getNicheConfig(businessType?: string): NicheConfig {
  return NICHE_CONFIG[businessType || 'general'] || NICHE_CONFIG.general
}
