import { PlaceResult } from './placesService';

/**
 * Dedicated Test-Only Fixture Module for Raahi.
 * These fixtures are strictly used in automated testing suites.
 * They are NEVER loaded or returned in production search mode.
 */

export const TEST_FIXTURES_ATLAS: Record<
  string,
  { name: string; address: string; lat: number; lng: number; types: string[]; primaryType: string }
> = {
  'somnath': {
    name: 'Somnath Temple',
    address: 'Somnath Mandir Rd, Prabhas Patan, Gujarat 362268',
    lat: 20.8880,
    lng: 70.4013,
    types: ['place_of_worship', 'hindu_temple', 'tourist_attraction', 'point_of_interest'],
    primaryType: 'hindu_temple',
  },
  'hawa mahal': {
    name: 'Hawa Mahal',
    address: 'Hawa Mahal Rd, Badi Choupad, J.D.A. Market, Pink City, Jaipur, Rajasthan 302002',
    lat: 26.9239,
    lng: 75.8267,
    types: ['tourist_attraction', 'historical_landmark', 'point_of_interest'],
    primaryType: 'historical_landmark',
  },
  'हवा महल': {
    name: 'Hawa Mahal',
    address: 'Hawa Mahal Rd, Badi Choupad, J.D.A. Market, Pink City, Jaipur, Rajasthan 302002',
    lat: 26.9239,
    lng: 75.8267,
    types: ['tourist_attraction', 'historical_landmark', 'point_of_interest'],
    primaryType: 'historical_landmark',
  },
  'rail museum': {
    name: 'National Rail Museum',
    address: 'Chanakyapuri, New Delhi, Delhi 110021',
    lat: 28.5855,
    lng: 77.1802,
    types: ['museum', 'tourist_attraction', 'point_of_interest'],
    primaryType: 'museum',
  },
  'हौज खास': {
    name: 'Hauz Khas',
    address: 'Hauz Khas, New Delhi, Delhi 110016',
    lat: 28.5494,
    lng: 77.2001,
    types: ['sublocality', 'political', 'neighborhood'],
    primaryType: 'sublocality',
  },
  'hauz khas': {
    name: 'Hauz Khas',
    address: 'Hauz Khas, New Delhi, Delhi 110016',
    lat: 28.5494,
    lng: 77.2001,
    types: ['sublocality', 'political', 'neighborhood'],
    primaryType: 'sublocality',
  },
  'agra': {
    name: 'Agra',
    address: 'Agra, Uttar Pradesh, India',
    lat: 27.1767,
    lng: 78.0081,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'mathura': {
    name: 'Mathura',
    address: 'Mathura, Uttar Pradesh, India',
    lat: 27.4924,
    lng: 77.6737,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'delhi': {
    name: 'Delhi',
    address: 'New Delhi, Delhi, India',
    lat: 28.6139,
    lng: 77.2090,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'jaipur': {
    name: 'Jaipur',
    address: 'Jaipur, Rajasthan, India',
    lat: 26.9124,
    lng: 75.7873,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'mumbai': {
    name: 'Mumbai',
    address: 'Mumbai, Maharashtra, India',
    lat: 19.0760,
    lng: 72.8777,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'pune': {
    name: 'Pune',
    address: 'Pune, Maharashtra, India',
    lat: 18.5204,
    lng: 73.8567,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'hyderabad': {
    name: 'Hyderabad',
    address: 'Hyderabad, Telangana, India',
    lat: 17.3850,
    lng: 78.4867,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'kolkata': {
    name: 'Kolkata',
    address: 'Kolkata, West Bengal, India',
    lat: 22.5726,
    lng: 88.3639,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'cyber hub': {
    name: 'DLF CyberHub',
    address: 'DLF Cyber City, DLF Phase 2, Sector 24, Gurugram, Haryana 122002',
    lat: 28.4952,
    lng: 77.0883,
    types: ['shopping_mall', 'point_of_interest', 'food'],
    primaryType: 'shopping_mall',
  },
  'dhaula kuan': {
    name: 'Dhaula Kuan',
    address: 'Dhaula Kuan, New Delhi, Delhi 110021',
    lat: 28.5916,
    lng: 77.1615,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'gateway of india': {
    name: 'Gateway of India',
    address: 'Apollo Bandar, Colaba, Mumbai, Maharashtra 400001',
    lat: 18.9220,
    lng: 72.8347,
    types: ['tourist_attraction', 'historical_landmark', 'point_of_interest'],
    primaryType: 'historical_landmark',
  },
  'victoria memorial': {
    name: 'Victoria Memorial',
    address: '1, Queens Way, Maidan, Kolkata, West Bengal 700071',
    lat: 22.5448,
    lng: 88.3426,
    types: ['tourist_attraction', 'museum', 'point_of_interest'],
    primaryType: 'museum',
  },
  'bangla sahib': {
    name: 'Gurudwara Bangla Sahib',
    address: 'Ashoka Road, Hanuman Road Area, Connaught Place, New Delhi, Delhi 110001',
    lat: 28.6264,
    lng: 77.2090,
    types: ['place_of_worship', 'tourist_attraction', 'point_of_interest'],
    primaryType: 'place_of_worship',
  },
  'gurudwara bangla sahib': {
    name: 'Gurudwara Bangla Sahib',
    address: 'Ashoka Road, Hanuman Road Area, Connaught Place, New Delhi, Delhi 110001',
    lat: 28.6264,
    lng: 77.2090,
    types: ['place_of_worship', 'tourist_attraction', 'point_of_interest'],
    primaryType: 'place_of_worship',
  },
  'india gate': {
    name: 'India Gate',
    address: 'Kartavya Path, India Gate, New Delhi, Delhi 110001',
    lat: 28.6129,
    lng: 77.2295,
    types: ['tourist_attraction', 'historical_landmark', 'point_of_interest'],
    primaryType: 'historical_landmark',
  },
  'jodhpur': {
    name: 'Jodhpur',
    address: 'Jodhpur, Rajasthan, India',
    lat: 26.2389,
    lng: 73.0243,
    types: ['locality', 'political'],
    primaryType: 'locality',
  },
  'gtbit': {
    name: 'Guru Tegh Bahadur Institute of Technology',
    address: 'G-8 Area, Press Colony, Rajouri Garden, New Delhi, Delhi 110027',
    lat: 28.6300,
    lng: 77.1085,
    types: ['university', 'school', 'point_of_interest', 'establishment'],
    primaryType: 'university',
  },
  'guru tegh bahadur institute of technology': {
    name: 'Guru Tegh Bahadur Institute of Technology',
    address: 'G-8 Area, Press Colony, Rajouri Garden, New Delhi, Delhi 110027',
    lat: 28.6300,
    lng: 77.1085,
    types: ['university', 'school', 'point_of_interest', 'establishment'],
    primaryType: 'university',
  },
};

export function getTestPlaceCandidates(
  query: string,
  normalizedName?: string,
  localityContext?: string
): PlaceResult[] {
  const norm = `${query || ''} ${normalizedName || ''} ${localityContext || ''}`.toLowerCase().trim();

  // Gibberish / nonexistent check
  if (
    /xyzqwe|totallyfake|nonexistent|qazwsx|asdfghjkl|12345nonexistent|fakeunresolved/i.test(norm) ||
    (norm.length > 20 && !norm.includes(' ') && !/[\u0900-\u0D7F]/.test(norm))
  ) {
    return [];
  }

  // Guru Tegh Bahadur Institute of Technology (GTBIT) nearby search fixtures
  if (norm.includes('gtbit') || norm.includes('guru tegh bahadur institute') || norm.includes('guru tegh bahadur')) {
    if (norm.includes('cafe') || norm.includes('coffee')) {
      return [
        {
          id: 'campus-cafe-gtbit',
          name: 'The Campus Cafe GTBIT',
          address: 'Opposite GTBIT Gate 1, Rajouri Garden, New Delhi 110027',
          latLng: { lat: 28.6308, lng: 77.1092 },
          rating: 4.6,
          userRatingCount: 420,
          openNow: true,
          types: ['cafe', 'coffee_shop', 'food', 'point_of_interest'],
          primaryType: 'cafe',
          category: 'restaurant',
        },
        {
          id: 'brew-hub-rajouri',
          name: 'Brew Hub Coffee & Snacks',
          address: 'Main Road, Subhash Nagar near GTBIT, New Delhi 110027',
          latLng: { lat: 28.6315, lng: 77.1102 },
          rating: 4.4,
          userRatingCount: 290,
          openNow: true,
          types: ['cafe', 'coffee_shop', 'food', 'point_of_interest'],
          primaryType: 'cafe',
          category: 'restaurant',
        },
        // Synthetic fixture for deterministic negative geographic-validation test
        {
          id: 'singapore-gtbit-imposter-cafe',
          name: 'Marina Bay Cafe',
          address: 'Marina Bay Sands, 10 Bayfront Ave, Singapore 018956',
          latLng: { lat: 1.3521, lng: 103.8198 },
          rating: 4.8,
          userRatingCount: 1200,
          openNow: true,
          types: ['cafe', 'food', 'point_of_interest'],
          primaryType: 'cafe',
          category: 'restaurant',
        },
      ];
    }
    if (norm.includes('restaurant') || norm.includes('food')) {
      return [
        {
          id: 'rajouri-food-court-gtbit',
          name: 'Rajouri Spice Restaurant',
          address: 'Block G-8, Near GTBIT, Rajouri Garden, New Delhi 110027',
          latLng: { lat: 28.6312, lng: 77.1095 },
          rating: 4.5,
          userRatingCount: 680,
          openNow: true,
          types: ['restaurant', 'food', 'point_of_interest'],
          primaryType: 'restaurant',
          category: 'restaurant',
        },
        {
          id: 'subhash-dhaba-near-gtbit',
          name: 'Subhash Corner Dhaba',
          address: 'Near Rajouri Flyover & GTBIT, New Delhi 110027',
          latLng: { lat: 28.6295, lng: 77.1075 },
          rating: 4.3,
          userRatingCount: 340,
          openNow: true,
          types: ['restaurant', 'food', 'point_of_interest'],
          primaryType: 'restaurant',
          category: 'restaurant',
        },
        // Synthetic fixture for deterministic negative geographic-validation test
        {
          id: 'singapore-gtbit-imposter-restaurant',
          name: 'Orchard Garden Dining',
          address: 'Orchard Rd, Singapore 238867',
          latLng: { lat: 1.3048, lng: 103.8318 },
          rating: 4.7,
          userRatingCount: 890,
          openNow: true,
          types: ['restaurant', 'food', 'point_of_interest'],
          primaryType: 'restaurant',
          category: 'restaurant',
        },
      ];
    }
    // Default GTBIT landmark resolution
    return [
      {
        id: 'gtbit-rajouri-garden',
        name: 'Guru Tegh Bahadur Institute of Technology',
        address: 'G-8 Area, Press Colony, Rajouri Garden, New Delhi, Delhi 110027',
        latLng: { lat: 28.6300, lng: 77.1085 },
        types: ['university', 'school', 'point_of_interest', 'establishment'],
        primaryType: 'university',
        category: 'custom',
      },
    ];
  }

  // Le Méridien Jaipur fixture
  if (norm.includes('meridien') || norm.includes('méridien')) {
    return [
      {
        id: 'le-meridien-jaipur-resort',
        name: 'Le Méridien Jaipur Resort & Spa',
        address: 'Number 1, RIICO Kukas, Jaipur, Rajasthan 302028, India',
        latLng: { lat: 27.0267, lng: 75.8906 },
        types: ['lodging', 'resort', 'hotel', 'point_of_interest', 'establishment'],
        primaryType: 'resort_hotel',
        category: 'custom',
      },
      {
        id: 'le-meridien-restaurant-jaipur',
        name: 'Latest Recipe at Le Méridien',
        address: 'Le Méridien Jaipur, Kukas, Jaipur, Rajasthan 302028',
        latLng: { lat: 27.0269, lng: 75.8908 },
        types: ['restaurant', 'food', 'point_of_interest'],
        primaryType: 'restaurant',
        category: 'restaurant',
      },
    ];
  }

  // Lakshmi Narayan Mandir fixture
  if (norm.includes('lakshmi narayan') || norm.includes('laxmi narayan') || norm.includes('लक्ष्मी नारायण')) {
    const results: PlaceResult[] = [];
    if (norm.includes('malviya') || norm.includes('मालवीय')) {
      results.push({
        id: 'laxmi-narayan-malviya-nagar-delhi',
        name: 'Lakshmi Narayan Mandir',
        address: 'D-Block, Malviya Nagar, New Delhi, Delhi 110017, India',
        latLng: { lat: 28.5325, lng: 77.2085 },
        types: ['place_of_worship', 'hindu_temple', 'point_of_interest'],
        primaryType: 'hindu_temple',
        category: 'custom',
      });
      results.push({
        id: 'birla-mandir-jaipur',
        name: 'Birla Mandir (Lakshmi Narayan Temple)',
        address: 'Jawahar Lal Nehru Marg, Tilak Nagar, Jaipur, Rajasthan 302004, India',
        latLng: { lat: 26.8923, lng: 75.8155 },
        types: ['place_of_worship', 'hindu_temple', 'tourist_attraction', 'point_of_interest'],
        primaryType: 'hindu_temple',
        category: 'custom',
      });
      return results;
    }
  }

  // Ambiguous landmark test: Clock Tower (Dehradun vs Jodhpur)
  if (norm.includes('clock tower') || norm.includes('ghanta ghar')) {
    return [
      {
        id: 'clock-tower-dehradun',
        name: 'Ghanta Ghar (Clock Tower Dehradun)',
        address: 'Rajpur Rd, Chukkuwala, Dehradun, Uttarakhand 248001',
        latLng: { lat: 30.3244, lng: 78.0417 },
        types: ['historical_landmark', 'tourist_attraction', 'point_of_interest'],
        primaryType: 'historical_landmark',
        category: 'custom',
      },
      {
        id: 'clock-tower-jodhpur',
        name: 'Ghanta Ghar (Clock Tower Jodhpur)',
        address: 'Nai Sarak, Ghantaghar Market, Jodhpur, Rajasthan 342001',
        latLng: { lat: 26.2950, lng: 73.0245 },
        types: ['historical_landmark', 'tourist_attraction', 'point_of_interest'],
        primaryType: 'historical_landmark',
        category: 'custom',
      },
    ];
  }

  // Bangla Sahib nearby search fixtures (tea stalls, chai, snacks, pakode)
  if (
    norm.includes('bangla sahib') ||
    norm.includes('bangla_sahib') ||
    (norm.includes('chai') && norm.includes('bangla')) ||
    (norm.includes('tea') && norm.includes('bangla')) ||
    (norm.includes('pakod') && norm.includes('bangla'))
  ) {
    if (
      norm.includes('chai') ||
      norm.includes('tea') ||
      norm.includes('pakod') ||
      norm.includes('snack') ||
      norm.includes('shop') ||
      norm.includes('stall') ||
      norm.includes('option') ||
      norm.includes('dukaan') ||
      norm.includes('tapri')
    ) {
      return [
        {
          id: 'sharma-tea-stall-bangla-sahib',
          name: 'Sharma Tea & Pakode Corner',
          address: 'Near Gole Market, Bangla Sahib Marg, New Delhi 110001',
          latLng: { lat: 28.6280, lng: 77.2070 },
          rating: 4.6,
          userRatingCount: 320,
          openNow: true,
          types: ['cafe', 'food', 'point_of_interest'],
          primaryType: 'cafe',
          category: 'restaurant',
        },
        {
          id: 'bangla-sweet-house-tea',
          name: 'Bangla Sweet House & Chai Snacks',
          address: '115-117, Bangla Sahib Marg, Gole Market, New Delhi 110001',
          latLng: { lat: 28.6275, lng: 77.2082 },
          rating: 4.4,
          userRatingCount: 1540,
          openNow: true,
          types: ['restaurant', 'bakery', 'food', 'point_of_interest'],
          primaryType: 'restaurant',
          category: 'restaurant',
        },
        {
          id: 'tapri-chai-connaught',
          name: 'Tapri Special Masala Chai & Pakoda Stall',
          address: 'Bhai Veer Singh Marg, Near Gurudwara Bangla Sahib, New Delhi 110001',
          latLng: { lat: 28.6255, lng: 77.2105 },
          rating: 4.5,
          userRatingCount: 210,
          openNow: true,
          types: ['cafe', 'food', 'point_of_interest'],
          primaryType: 'cafe',
          category: 'restaurant',
        },
      ];
    }
  }

  // India Gate nearby fixtures (Domino's, restaurants)
  if (norm.includes('india gate') || norm.includes('india_gate')) {
    if (norm.includes('domino')) {
      return [
        {
          id: 'dominos-connaught-place-outer',
          name: "Domino's Pizza",
          address: 'Connaught Place / KG Marg near India Gate, New Delhi 110001',
          latLng: { lat: 28.6200, lng: 77.2250 },
          rating: 4.2,
          userRatingCount: 880,
          openNow: true,
          types: ['restaurant', 'food', 'meal_takeaway', 'point_of_interest'],
          primaryType: 'restaurant',
          category: 'restaurant',
        },
      ];
    }
    if (norm.includes('restaurant') || norm.includes('food')) {
      return [
        {
          id: 'andhra-bhavan-canteen',
          name: 'Andhra Bhavan Restaurant',
          address: 'Ashoka Road, near India Gate, New Delhi 110001',
          latLng: { lat: 28.6180, lng: 77.2240 },
          rating: 4.6,
          userRatingCount: 4200,
          openNow: true,
          types: ['restaurant', 'food', 'point_of_interest'],
          primaryType: 'restaurant',
          category: 'restaurant',
        },
        {
          id: 'gulati-restaurant-pandara',
          name: 'Gulati Restaurant',
          address: '6, Pandara Road Market, near India Gate, New Delhi 110003',
          latLng: { lat: 28.6050, lng: 77.2340 },
          rating: 4.7,
          userRatingCount: 5100,
          openNow: true,
          types: ['restaurant', 'food', 'point_of_interest'],
          primaryType: 'restaurant',
          category: 'restaurant',
        },
      ];
    }
  }

  // Hawa Mahal nearby fixtures (pharmacies)
  if (norm.includes('hawa mahal') && (norm.includes('pharmacy') || norm.includes('medical') || norm.includes('chemist'))) {
    return [
      {
        id: 'apollo-pharmacy-badi-choupad',
        name: 'Apollo Pharmacy Badi Choupad',
        address: 'Shop 12, Badi Choupad, Near Hawa Mahal, Jaipur 302002',
        latLng: { lat: 26.9245, lng: 75.8270 },
        rating: 4.5,
        userRatingCount: 140,
        openNow: true,
        types: ['pharmacy', 'health', 'point_of_interest'],
        primaryType: 'pharmacy',
        category: 'pharmacy',
      },
      {
        id: 'rajasthan-medicos-hawa-mahal',
        name: 'Rajasthan Medical & Chemist Store',
        address: 'Opposite Hawa Mahal, Johari Bazaar Road, Jaipur 302002',
        latLng: { lat: 26.9230, lng: 75.8260 },
        rating: 4.3,
        userRatingCount: 85,
        openNow: true,
        types: ['pharmacy', 'health', 'point_of_interest'],
        primaryType: 'pharmacy',
        category: 'pharmacy',
      },
    ];
  }

  // Barista fixture
  if (norm.includes('barista')) {
    return [
      {
        id: 'barista-mathura-highway',
        name: 'Barista Coffee Highway Lounge',
        address: 'NH 19, Delhi-Mathura Highway, Chhatikara, Mathura, Uttar Pradesh 281001',
        latLng: { lat: 27.5610, lng: 77.6240 },
        rating: 4.3,
        userRatingCount: 410,
        openNow: true,
        types: ['cafe', 'coffee_shop', 'food', 'point_of_interest'],
        primaryType: 'cafe',
        category: 'restaurant',
      },
    ];
  }

  // Brijwasi Mathura fixture
  if (norm.includes('brijwasi')) {
    return [
      {
        id: 'brijwasi-mithai-mathura',
        name: 'Brijwasi Mithaiwala & Restaurant',
        address: 'Holi Gate, Mathura, Uttar Pradesh 281001',
        latLng: { lat: 27.4960, lng: 77.6780 },
        rating: 4.7,
        userRatingCount: 2200,
        openNow: true,
        types: ['restaurant', 'bakery', 'food', 'point_of_interest'],
        primaryType: 'restaurant',
        category: 'restaurant',
      },
    ];
  }

  // Radisson Jodhpur fixture
  if (norm.includes('radisson') && (norm.includes('jodhpur') || norm.includes('hotel'))) {
    return [
      {
        id: 'radisson-hotel-jodhpur',
        name: 'Radisson Hotel Jodhpur',
        address: 'Gaurav Path, Residency Road, Jodhpur, Rajasthan 342001',
        latLng: { lat: 26.2680, lng: 73.0180 },
        rating: 4.5,
        userRatingCount: 3100,
        openNow: true,
        types: ['lodging', 'hotel', 'point_of_interest'],
        primaryType: 'hotel',
        category: 'custom',
      },
    ];
  }

  // Punjabi restaurant candidates for test validation
  if (norm.includes('punjabi') || norm.includes('पंजाबी') || (norm.includes('restaurant') && norm.includes('4.5'))) {
    return [
      {
        id: 'punjabi-haveli-dhaba',
        name: 'Haveli Punjabi Dhaba',
        address: 'NH 19, Highway Route, Mathura Road, Uttar Pradesh',
        latLng: { lat: 27.5500, lng: 77.6200 },
        rating: 4.8,
        userRatingCount: 1240,
        openNow: true,
        types: ['restaurant', 'food', 'point_of_interest'],
        primaryType: 'restaurant',
        category: 'restaurant',
      },
      {
        id: 'pind-balluchi-restaurant',
        name: 'Pind Balluchi Punjabi Restaurant',
        address: 'Expressway Service Road, Mathura, Uttar Pradesh',
        latLng: { lat: 27.5800, lng: 77.6400 },
        rating: 4.6,
        userRatingCount: 890,
        openNow: true,
        types: ['restaurant', 'food', 'point_of_interest'],
        primaryType: 'restaurant',
        category: 'restaurant',
      },
      {
        id: 'amritsari-dhaba-route',
        name: 'Amritsari Kulcha Corner',
        address: 'Highway Plaza, Mathura Road',
        latLng: { lat: 27.5200, lng: 77.6600 },
        rating: 4.2, // Below 4.5! Strictly filtered out by >4.5 condition
        userRatingCount: 420,
        openNow: true,
        types: ['restaurant', 'food', 'point_of_interest'],
        primaryType: 'restaurant',
        category: 'restaurant',
      },
      {
        id: 'highway-punjabi-rasoi',
        name: 'Highway Punjabi Rasoi',
        address: 'Old Bypass, Mathura',
        latLng: { lat: 27.4800, lng: 77.6900 },
        // Missing rating! Strictly excluded by >4.5 requirement
        types: ['restaurant', 'food', 'point_of_interest'],
        primaryType: 'restaurant',
        category: 'restaurant',
      },
    ];
  }

  // Petrol station candidates for test validation
  if (norm.includes('petrol') || norm.includes('पेट्रोल') || norm.includes('fuel') || norm.includes('gas_station')) {
    return [
      {
        id: 'indianoil-nh19-swagat',
        name: 'IndianOil Swagat Fuel Station',
        address: 'NH 19, Highway Route, Mathura District, Uttar Pradesh 281403',
        latLng: { lat: 27.7950, lng: 77.4320 },
        rating: 4.4,
        userRatingCount: 520,
        openNow: true,
        types: ['gas_station', 'point_of_interest', 'establishment'],
        primaryType: 'gas_station',
        category: 'gas_station',
      },
      {
        id: 'hp-petrol-chhatikara',
        name: 'HP Auto Care Petrol Pump',
        address: 'NH 19, Chhatikara, Mathura, Uttar Pradesh 281001',
        latLng: { lat: 27.5600, lng: 77.6250 },
        rating: 4.3,
        userRatingCount: 310,
        openNow: true,
        types: ['gas_station', 'point_of_interest', 'establishment'],
        primaryType: 'gas_station',
        category: 'gas_station',
      },
      {
        id: 'bpcl-highway-king',
        name: 'Bharat Petroleum Highway King',
        address: 'Delhi-Agra Expressway, Mathura Road, Uttar Pradesh',
        latLng: { lat: 27.6800, lng: 77.5100 },
        rating: 4.5,
        userRatingCount: 440,
        openNow: true,
        types: ['gas_station', 'point_of_interest', 'establishment'],
        primaryType: 'gas_station',
        category: 'gas_station',
      },
    ];
  }

  // DPS RK Puram fixture
  if (norm.includes('dps') || norm.includes('delhi public school')) {
    return [
      {
        id: 'dps-rkp',
        name: 'Delhi Public School, R.K. Puram (DPS RK Puram)',
        address: 'Kaifi Azmi Marg, Sector 12, RK Puram, New Delhi, Delhi 110022',
        latLng: { lat: 28.5665, lng: 77.1767 },
        types: ['school', 'educational_institution', 'point_of_interest'],
        primaryType: 'school',
        category: 'custom',
      },
    ];
  }

  // Rajouri Garden fixture
  if (norm.includes('rajouri garden')) {
    return [
      {
        id: 'rajouri-garden-locality',
        name: 'Rajouri Garden',
        address: 'Rajouri Garden, New Delhi, Delhi 110027, India',
        latLng: { lat: 28.6415, lng: 77.1209 },
        types: ['sublocality', 'sublocality_level_1', 'locality', 'political'],
        primaryType: 'sublocality_level_1',
        category: 'custom',
      },
    ];
  }

  for (const [key, item] of Object.entries(TEST_FIXTURES_ATLAS)) {
    if (norm.includes(key)) {
      return [
        {
          id: `atlas-${key.replace(/[^a-z0-9]/gi, '-')}`,
          name: item.name,
          address: item.address,
          latLng: { lat: item.lat, lng: item.lng },
          types: item.types,
          primaryType: item.primaryType,
          category: 'custom',
        },
      ];
    }
  }

  return [];
}
