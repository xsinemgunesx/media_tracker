import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDoc, onSnapshot, query, updateDoc, deleteDoc, addDoc 
} from 'firebase/firestore';
import { 
  Film, Tv, PlayCircle, CheckCircle2, Clock, Star, LayoutGrid, List, Search, Plus, 
  Layers, Calendar, ChevronLeft, ChevronRight, ArrowUpDown, X, Hash, ExternalLink, 
  Trash2, Heart, Bookmark, Ban, Sparkles, Loader2, Info, BrainCircuit, Wand2, Coffee
} from 'lucide-react';

// Firebase Yapılandırması (Ortam değişkenlerinden alınır)
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'media-tracker-pro';

const App = () => {
  const [user, setUser] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [activeType, setActiveType] = useState('Hepsi');
  const [activeStatus, setActiveStatus] = useState('Hepsi');
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortBy, setSortBy] = useState('index_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const itemsPerPage = 8;

  const apiKey = ""; // API Key ortamdan otomatik alınır

  // 1. Kimlik Doğrulama (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Veri Çekme (RULE 1 & 2)
  useEffect(() => {
    if (!user) return;

    // Kullanıcıya özel koleksiyon yolu
    const mediaCol = collection(db, 'artifacts', appId, 'users', user.uid, 'media_items');
    
    const unsubscribe = onSnapshot(mediaCol, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMediaItems(items);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // ✨ Gemini API: Veri Çekme
  const fetchMediaData = async () => {
    if (!newItemTitle || !user) return;
    setIsFetching(true);
    
    try {
      const systemPrompt = "Sen profesyonel bir film/dizi veri tabanısın. IMDb verilerini JSON olarak dön.";
      const userPrompt = `"${newItemTitle}" bilgilerini bul. JSON: { "title": "...", "type": "Film" veya "Dizi", "director": "...", "rating": 8.5, "duration": "120 dk", "category": "...", "seasonCount": 5, "totalEpisodes": 60, "summary": "...", "image": "URL" }`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ google_search: {} }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const result = await response.json();
      const data = JSON.parse(result.candidates[0].content.parts[0].text);
      
      const mediaCol = collection(db, 'artifacts', appId, 'users', user.uid, 'media_items');
      await addDoc(mediaCol, {
        ...data,
        index: mediaItems.length + 1,
        status: data.type === 'Dizi' ? 'İzleniyor' : 'İzlenecek',
        currentSeason: data.type === 'Dizi' ? 1 : 0,
        currentEpisode: data.type === 'Dizi' ? 1 : 0,
        isFavorite: false,
        createdAt: new Date().toISOString()
      });

      setShowAddModal(false);
      setNewItemTitle('');
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setIsFetching(false);
    }
  };

  // İlerleme Güncelleme (Diziler için)
  const updateProgress = async (itemId, season, episode) => {
    if (!user) return;
    const itemDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'media_items', itemId);
    await updateDoc(itemDoc, {
      currentSeason: Number(season),
      currentEpisode: Number(episode)
    });
    setSelectedItem(prev => ({ ...prev, currentSeason: season, currentEpisode: episode }));
  };

  // Favori Durumu Değiştirme
  const toggleFavorite = async (item) => {
    if (!user) return;
    const itemDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'media_items', item.id);
    await updateDoc(itemDoc, { isFavorite: !item.isFavorite });
    if (selectedItem?.id === item.id) setSelectedItem({ ...item, isFavorite: !item.isFavorite });
  };

  // İçerik Silme
  const deleteItem = async (itemId) => {
    if (!user) return;
    const itemDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'media_items', itemId);
    await deleteDoc(itemDoc);
    setSelectedItem(null);
  };

  // Filtreleme & Sıralama
  const processedItems = useMemo(() => {
    let filtered = mediaItems.filter(item => {
      const matchesType = activeType === 'Hepsi' || item.type === activeType;
      const matchesStatus = activeStatus === 'Hepsi' 
        ? true 
        : activeStatus === 'Favoriler' ? item.isFavorite : item.status === activeStatus;
      const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesStatus && matchesSearch;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'index_asc') return a.index - b.index;
      if (sortBy === 'index_desc') return b.index - a.index;
      if (sortBy === 'rating') return b.rating - a.rating;
      return 0;
    });
  }, [mediaItems, activeType, activeStatus, searchQuery, sortBy]);

  const currentItems = processedItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Status Options
  const statusOptions = [
    { id: 'Hepsi', label: 'Hepsi', icon: LayoutGrid, color: 'text-gray-500' },
    { id: 'İzleniyor', label: 'İzleniyor', icon: PlayCircle, color: 'text-blue-500' },
    { id: 'İzlenecek', label: 'İzlenecek', icon: Bookmark, color: 'text-amber-500' },
    { id: 'İzledi', label: 'İzledi', icon: CheckCircle2, color: 'text-green-500' },
    { id: 'Favoriler', label: 'Favoriler', icon: Heart, color: 'text-pink-500' },
  ];

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBFBFA]">
      <Loader2 className="animate-spin text-black" size={48} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-[#37352f] pb-20 selection:bg-blue-100">
      {/* Banner */}
      <div className="h-64 w-full bg-[#1A1A1A] relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80')] bg-cover bg-center opacity-30 grayscale" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FBFBFA] to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 -mt-24 relative z-10">
        <div className="flex flex-col md:flex-row items-center md:items-end justify-between mb-12 gap-6">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-8 text-center md:text-left">
            <div className="w-32 h-32 md:w-40 md:h-40 bg-white rounded-[2.5rem] shadow-2xl flex items-center justify-center text-6xl border-8 border-white">🎬</div>
            <div className="pb-4">
              <h1 className="text-4xl font-black tracking-tighter">CINE-ARCHIVE</h1>
              <p className="text-gray-400 font-bold mt-1 text-xs tracking-widest uppercase">✨ Cloud Storage Aktif</p>
            </div>
          </div>
          <button 
            onClick={() => setShowAddModal(true)} 
            className="bg-black text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:scale-105 transition-all shadow-xl"
          >
            <Plus size={20}/> İÇERİK EKLE
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-8">
          {['Hepsi', 'Film', 'Dizi'].map(type => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`flex-1 py-4 rounded-2xl font-black text-xs transition-all border-2 ${
                activeType === type ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100'
              }`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Status Bar */}
        <div className="bg-white p-3 rounded-3xl border border-gray-100 shadow-sm mb-10 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {statusOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setActiveStatus(opt.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[11px] font-black uppercase transition-all ${
                  activeStatus === opt.id ? 'bg-gray-50 text-black' : 'text-gray-400'
                }`}
              >
                <opt.icon size={14} className={activeStatus === opt.id ? opt.color : 'text-gray-300'} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* List Content */}
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8' : 'space-y-4'}>
          {currentItems.map((item) => (
            <div 
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="bg-white group cursor-pointer transition-all duration-300 rounded-[2.5rem] border border-gray-100 overflow-hidden hover:shadow-2xl hover:-translate-y-2"
            >
              <div className="h-64 w-full relative overflow-hidden bg-gray-100">
                <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={item.title} />
                {item.type === 'Dizi' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20">
                    <div className="h-full bg-green-500" style={{ width: `${(item.currentSeason / item.seasonCount) * 100}%` }} />
                  </div>
                )}
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-black text-blue-600 uppercase">{item.type}</span>
                  {item.isFavorite && <Heart size={10} fill="#ec4899" className="text-pink-500" />}
                </div>
                <h3 className="font-bold text-lg line-clamp-1">{item.title}</h3>
                {item.type === 'Dizi' && (
                  <div className="text-[10px] font-bold text-green-600 mt-1 uppercase">S{item.currentSeason} B{item.currentEpisode}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Modal: Yeni Ekle */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl">
              <div className="flex justify-between items-start mb-8">
                <h2 className="text-2xl font-black">Yeni Ekle</h2>
                <button onClick={() => setShowAddModal(false)}><X/></button>
              </div>
              <input 
                type="text" 
                placeholder="Yapım adı..." 
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                className="w-full bg-gray-50 p-5 rounded-2xl outline-none font-bold mb-6"
                onKeyDown={(e) => e.key === 'Enter' && fetchMediaData()}
              />
              <button 
                disabled={isFetching}
                onClick={fetchMediaData}
                className="w-full bg-black text-white py-5 rounded-2xl font-black text-xs uppercase"
              >
                {isFetching ? "VERİ ÇEKİLİYOR..." : "✨ VERİLERİ GETİR"}
              </button>
            </div>
          </div>
        )}

        {/* Modal: Detaylar */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[150] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in">
              <div className="md:w-1/2 h-full relative">
                <img src={selectedItem.image} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black flex flex-col justify-end p-12">
                   <h2 className="text-5xl font-black text-white tracking-tighter">{selectedItem.title}</h2>
                </div>
              </div>
              <div className="md:w-1/2 p-12 overflow-y-auto bg-white relative">
                <button onClick={() => setSelectedItem(null)} className="absolute top-10 right-10"><X/></button>
                
                <div className="grid grid-cols-2 gap-4 mb-10">
                   <div className="bg-gray-50 p-6 rounded-3xl">
                      <span className="text-[10px] font-black text-gray-400 block mb-1 uppercase">YÖNETMEN</span>
                      <span className="font-bold">{selectedItem.director}</span>
                   </div>
                   <div className="bg-gray-50 p-6 rounded-3xl">
                      <span className="text-[10px] font-black text-gray-400 block mb-1 uppercase">PUAN</span>
                      <span className="font-bold flex items-center gap-1"><Star size={14} fill="#F59E0B" className="text-amber-500"/> {selectedItem.rating}</span>
                   </div>
                </div>

                {selectedItem.type === 'Dizi' && (
                  <div className="mb-10 p-8 bg-green-50 rounded-[2.5rem] border border-green-100">
                    <span className="text-xs font-black text-green-700 block mb-4">İLERLEME DURUMU</span>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase">Sezon</label>
                        <input 
                          type="number" 
                          value={selectedItem.currentSeason} 
                          onChange={(e) => updateProgress(selectedItem.id, e.target.value, selectedItem.currentEpisode)}
                          className="w-full bg-white p-3 rounded-xl border border-gray-100 font-bold"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase">Bölüm</label>
                        <input 
                          type="number" 
                          value={selectedItem.currentEpisode} 
                          onChange={(e) => updateProgress(selectedItem.id, selectedItem.currentSeason, e.target.value)}
                          className="w-full bg-white p-3 rounded-xl border border-gray-100 font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="p-8 bg-gray-50 rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-gray-400 block mb-2 uppercase">ÖZET</span>
                    <p className="text-gray-700 italic">{selectedItem.summary}</p>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => toggleFavorite(selectedItem)}
                      className={`flex-1 py-5 rounded-3xl font-black text-xs uppercase border-2 transition-all ${selectedItem.isFavorite ? 'bg-pink-50 border-pink-200 text-pink-500' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                    >
                      {selectedItem.isFavorite ? 'FAVORİLERDE' : 'FAVORİYE EKLE'}
                    </button>
                    <button 
                      onClick={() => deleteItem(selectedItem.id)}
                      className="px-8 bg-red-50 text-red-400 rounded-3xl"
                    >
                      <Trash2 size={24}/>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
