/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Component } from 'react';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { 
  User, 
  Phone, 
  MapPin, 
  GraduationCap, 
  CheckCircle, 
  Search, 
  Download, 
  Share2, 
  Trash2, 
  Edit, 
  LogOut, 
  LayoutDashboard,
  ArrowLeft,
  Copy,
  CreditCard,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';

// --- Utility Functions ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


// --- Types ---
interface Student {
  id?: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  address: string;
  mobileNumber: string;
  alternateNumber: string;
  class: string;
  stream: string;
  paymentStatus: 'PENDING' | 'FULL PAID';
  createdAt: any;
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className, 
  disabled,
  type = 'button'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; 
  className?: string; 
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const variants = {
    primary: 'bg-yellow-400 text-black hover:bg-yellow-500',
    secondary: 'bg-zinc-800 text-white hover:bg-zinc-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-yellow-400 hover:bg-zinc-800'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-6 py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Input = ({ 
  label, 
  icon: Icon, 
  ...props 
}: { 
  label: string; 
  icon?: any; 
  [key: string]: any 
}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />}
      <input
        {...props}
        className={cn(
          "w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all text-white",
          Icon && "pl-12"
        )}
      />
    </div>
  </div>
);

const Select = ({ 
  label, 
  options, 
  ...props 
}: { 
  label: string; 
  options: string[]; 
  [key: string]: any 
}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">{label}</label>
    <select
      {...props}
      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all text-white appearance-none"
    >
      <option value="">Select {label}</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'home' | 'admission' | 'admin' | 'scan' | 'details'>('home');
  const [user, setUser] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [idCardSide, setIdCardSide] = useState<'front' | 'back'>('front');
  const [showSuccess, setShowSuccess] = useState(false);

  // Admin Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Students for Admin
  useEffect(() => {
    if (user && user.email === 'santoshsantoshsingh597@gmail.com') {
      const q = collection(db, 'students');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        setStudents(data);
      });
      return () => unsubscribe();
    }
  }, [user]);

  const handleAdminLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setView('admin');
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('home');
  };

  // --- Admission Form Logic ---
  const [formData, setFormData] = useState({
    fullName: '',
    fatherName: '',
    motherName: '',
    address: '',
    mobileNumber: '',
    alternateNumber: '',
    class: '',
    stream: '',
  });

  const submitAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submit button clicked");
    console.log("Current Form Data:", formData);

    if (!formData.fullName || !formData.mobileNumber || !formData.class || !formData.stream) {
      console.log("Validation failed: missing required fields");
      alert("Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      // Check for duplicate mobile
      const q = query(collection(db, 'students'), where('mobileNumber', '==', formData.mobileNumber));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'students');
        return;
      }

      if (!querySnapshot.empty) {
        alert(`Mobile number ${formData.mobileNumber} is already registered! Please use a different number.`);
        setLoading(false);
        return;
      }

      const studentData = {
        ...formData,
        paymentStatus: 'PENDING' as const,
        createdAt: serverTimestamp(),
      };
      console.log("Submitting student data:", studentData);

      try {
        console.log("Calling addDoc...");
        const docRef = await addDoc(collection(db, 'students'), studentData);
        console.log("addDoc successful, doc ID:", docRef.id);
        
        setShowSuccess(true);
        setFormData({
          fullName: '',
          fatherName: '',
          motherName: '',
          address: '',
          mobileNumber: '',
          alternateNumber: '',
          class: '',
          stream: '',
        });
      } catch (error) {
        console.error("addDoc failed:", error);
        handleFirestoreError(error, OperationType.CREATE, 'students');
      }
    } catch (error: any) {
      console.error("Submission failed", error);
      let message = "Failed to submit form. Please try again.";
      
      // Extract meaningful error message
      if (typeof error === 'string') {
        message = error;
      } else if (error?.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error) message = parsed.error;
        } catch (e) {
          message = error.message;
        }
      }
      
      alert(`Submission Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- ID Card Logic ---
  const idCardRef = useRef<HTMLDivElement>(null);

  const downloadIDCard = async () => {
    if (!idCardRef.current) return;
    const canvas = await html2canvas(idCardRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`ID_CARD_${selectedStudent?.fullName}.pdf`);
  };

  const shareIDCard = () => {
    const text = `Student ID Card: ${selectedStudent?.fullName}\nClass: ${selectedStudent?.class}\nInstitute: ALPHA CLASSES BUXAR`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const togglePayment = async (student: Student) => {
    const newStatus = student.paymentStatus === 'FULL PAID' ? 'PENDING' : 'FULL PAID';
    try {
      await updateDoc(doc(db, 'students', student.id!), { paymentStatus: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${student.id}`);
    }
  };

  const deleteStudent = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this student?")) {
      try {
        await deleteDoc(doc(db, 'students', id));
        setSelectedStudent(null);
        setView('admin');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
      }
    }
  };

  const downloadCSV = () => {
    const headers = ['Full Name', 'Father Name', 'Mother Name', 'Address', 'Mobile', 'Class', 'Stream', 'Payment Status'];
    const rows = students.map(s => [
      s.fullName,
      s.fatherName,
      s.motherName,
      s.address,
      s.mobileNumber,
      s.class,
      s.stream,
      s.paymentStatus
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'students_data.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredStudents = students.filter(s => 
    s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.mobileNumber.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-yellow-400 selection:text-black">
      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl max-w-sm w-full text-center space-y-6 shadow-2xl"
          >
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black">Success!</h3>
              <p className="text-zinc-400">Admission form has been submitted successfully.</p>
            </div>
            <Button 
              onClick={() => {
                setShowSuccess(false);
                setView('home');
              }} 
              className="w-full bg-green-600 hover:bg-green-700 h-14"
            >
              Done
            </Button>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('admin')}>
          <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center text-black font-black text-xl">A</div>
          <div>
            <h1 className="font-black text-lg tracking-tight leading-none">ALPHA CLASSES</h1>
            <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-[0.2em]">BUXAR • Dir. Dk Singh</p>
          </div>
        </div>
        {user && user.email === 'santoshsantoshsingh597@gmail.com' && view !== 'home' && (
          <Button variant="ghost" onClick={handleLogout} className="px-3 py-2 text-xs">
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </header>

      <main className="max-w-md mx-auto p-6 pb-24">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 pt-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-black tracking-tighter leading-tight">
                  Shape Your <span className="text-yellow-400">Future</span> With Us.
                </h2>
                <p className="text-zinc-400 font-medium">Premier coaching for Class 9-12 in Buxar. Excellence in Science & Arts.</p>
              </div>

              <div className="grid gap-4">
                <Button onClick={() => setView('admission')} className="h-20 text-xl w-full">
                  <User className="w-6 h-6" /> Student Admission
                </Button>
              </div>
            </motion.div>
          )}

          {view === 'admission' && (
            <motion.div 
              key="admission"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('home')} className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-2xl font-black">Admission Form</h2>
              </div>

              <form onSubmit={submitAdmission} className="space-y-6">
                <Input label="Full Name" icon={User} placeholder="Enter student name" value={formData.fullName} onChange={(e: any) => setFormData({...formData, fullName: e.target.value})} required />
                <Input label="Father's Name" icon={User} placeholder="Enter father's name" value={formData.fatherName} onChange={(e: any) => setFormData({...formData, fatherName: e.target.value})} />
                <Input label="Mother's Name" icon={User} placeholder="Enter mother's name" value={formData.motherName} onChange={(e: any) => setFormData({...formData, motherName: e.target.value})} />
                <Input label="Address" icon={MapPin} placeholder="Full address" value={formData.address} onChange={(e: any) => setFormData({...formData, address: e.target.value})} />
                <Input label="Mobile Number" icon={Phone} placeholder="10-digit number" type="tel" value={formData.mobileNumber} onChange={(e: any) => setFormData({...formData, mobileNumber: e.target.value})} required />
                <Input label="Alternate Number" icon={Phone} placeholder="Optional" type="tel" value={formData.alternateNumber} onChange={(e: any) => setFormData({...formData, alternateNumber: e.target.value})} />
                
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Class" options={['9', '10', '11', '12']} value={formData.class} onChange={(e: any) => setFormData({...formData, class: e.target.value})} required />
                  <Select label="Stream" options={['Science', 'Arts']} value={formData.stream} onChange={(e: any) => setFormData({...formData, stream: e.target.value})} required />
                </div>

                <Button type="submit" className="w-full h-16 text-lg" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Admission Form"}
                </Button>
              </form>
            </motion.div>
          )}

          {view === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {!user || user.email !== 'santoshsantoshsingh597@gmail.com' ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-8">
                  <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center">
                    <LayoutDashboard className="w-10 h-10 text-yellow-400" />
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black">Admin Login</h2>
                    <p className="text-zinc-500">Access the dashboard to manage students.</p>
                  </div>
                  <Button onClick={handleAdminLogin} className="w-full max-w-xs">
                    Login with Google
                  </Button>
                  <Button onClick={() => setView('home')} variant="ghost">Back to Home</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setView('home')} className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800">
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <h2 className="text-2xl font-black">Dashboard</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={downloadCSV} className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800 text-yellow-400" title="Download CSV">
                        <Download className="w-5 h-5" />
                      </button>
                      <div className="bg-yellow-400 text-black px-3 py-1 rounded-full text-xs font-black">
                        {students.length} STUDENTS
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Search name or mobile..." 
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-yellow-400"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-4">
                    {filteredStudents.map(student => (
                      <motion.div 
                        key={student.id}
                        layout
                        className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center gap-4 hover:border-yellow-400/50 transition-all cursor-pointer"
                        onClick={() => {
                          setSelectedStudent(student);
                          setView('details');
                        }}
                      >
                        <div className="w-16 h-16 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
                          {student.photoUrl ? (
                            <img src={student.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600"><User /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-black truncate uppercase">{student.fullName}</h3>
                          <p className="text-xs font-bold text-zinc-500">Class {student.class} • {student.stream}</p>
                          <p className="text-xs font-bold text-yellow-400 mt-1">{student.mobileNumber}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={cn(
                            "px-2 py-1 rounded text-[10px] font-black uppercase",
                            student.paymentStatus === 'FULL PAID' ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                          )}>
                            {student.paymentStatus}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'details' && selectedStudent && (
            <motion.div 
              key="details"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setView(user?.email === 'santoshsantoshsingh597@gmail.com' ? 'admin' : 'home')} className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-black">Student Details</h2>
                {user?.email === 'santoshsantoshsingh597@gmail.com' && (
                  <button onClick={() => deleteStudent(selectedStudent.id!)} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* ID Card Preview */}
              <div className="flex flex-col items-center space-y-4">
                <div className="flex bg-zinc-900 p-1 rounded-xl">
                  <button 
                    onClick={() => setIdCardSide('front')}
                    className={cn("px-4 py-2 rounded-lg text-xs font-black transition-all", idCardSide === 'front' ? "bg-yellow-400 text-black" : "text-zinc-500")}
                  >
                    FRONT SIDE
                  </button>
                  <button 
                    onClick={() => setIdCardSide('back')}
                    className={cn("px-4 py-2 rounded-lg text-xs font-black transition-all", idCardSide === 'back' ? "bg-yellow-400 text-black" : "text-zinc-500")}
                  >
                    BACK SIDE
                  </button>
                </div>

                <div 
                  ref={idCardRef}
                  className="w-[350px] bg-white text-black overflow-hidden shadow-2xl relative font-sans"
                  style={{ aspectRatio: '1.58/1' }}
                >
                  {idCardSide === 'front' ? (
                    <div className="h-full flex flex-col">
                      {/* Header */}
                      <div className="bg-[#002060] h-14 flex items-center px-4 relative overflow-hidden">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border-2 border-[#FFC000] z-10">
                          <div className="text-[#002060] font-black text-[10px] text-center leading-none">ALPHA<br/>CLASSES</div>
                        </div>
                        <div className="ml-3 z-10">
                          <h3 className="text-white text-lg font-black tracking-tight leading-none">ALPHA CLASSES</h3>
                          <p className="text-white text-[8px] font-bold tracking-widest">BUXAR</p>
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-32 bg-[#FFC000] skew-x-[-30deg] translate-x-12"></div>
                      </div>

                      {/* Title */}
                      <div className="text-center py-1">
                        <h4 className="text-[#004B49] text-xl font-black tracking-wider uppercase">STUDENT ID CARD</h4>
                      </div>

                      {/* Content */}
                      <div className="flex-1 flex px-4 pb-2 relative">
                        {/* Watermark */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                          <div className="w-40 h-40 border-[10px] border-[#002060] rounded-full flex items-center justify-center text-[#002060] font-black text-2xl">ALPHA</div>
                        </div>

                        {/* Details */}
                        <div className="flex-1 space-y-1.5 pt-2">
                          <div className="flex text-[10px]">
                            <span className="w-20 font-bold text-zinc-600">Name</span>
                            <span className="font-black">: {selectedStudent.fullName}</span>
                          </div>
                          <div className="flex text-[10px]">
                            <span className="w-20 font-bold text-zinc-600">ROLL No.</span>
                            <span className="font-black">: {selectedStudent.id?.slice(-6).toUpperCase()}</span>
                          </div>
                          <div className="flex text-[10px]">
                            <span className="w-20 font-bold text-zinc-600">Father Name</span>
                            <span className="font-black">: {selectedStudent.fatherName || 'N/A'}</span>
                          </div>
                          <div className="flex text-[10px]">
                            <span className="w-20 font-bold text-zinc-600">Mother Name</span>
                            <span className="font-black">: {selectedStudent.motherName || 'N/A'}</span>
                          </div>
                          <div className="flex text-[10px]">
                            <span className="w-20 font-bold text-zinc-600">Mobile No.</span>
                            <span className="font-black">: {selectedStudent.mobileNumber}</span>
                          </div>
                        </div>

                        {/* QR Code */}
                        <div className="w-20 flex flex-col items-center justify-center">
                          <div className="p-1 border-2 border-black rounded">
                            <QRCodeSVG value={selectedStudent.id!} size={60} />
                          </div>
                          <div className="bg-black text-white w-full text-[8px] font-black py-0.5 mt-1 text-center rounded flex items-center justify-center gap-1">
                            <Smartphone className="w-2 h-2" /> SCAN ME
                          </div>
                        </div>
                      </div>

                      {/* Barcode Placeholder */}
                      <div className="flex justify-center mb-1">
                        <div className="h-6 w-48 flex gap-[1px]">
                          {Array.from({length: 40}).map((_, i) => (
                            <div key={i} className="bg-[#004B49]" style={{ width: Math.random() > 0.5 ? '2px' : '1px' }}></div>
                          ))}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="h-10 relative flex items-center px-4">
                        <div className="absolute left-0 bottom-0 w-32 h-full bg-[#FFC000] skew-x-[30deg] -translate-x-6"></div>
                        <div className="absolute inset-0 bg-[#002060] -z-10"></div>
                        
                        <div className="z-10 flex items-center gap-1 text-black">
                          <div className="leading-none">
                            <p className="text-[7px] font-bold">Dir.DK Singh</p>
                            <div className="flex items-center gap-0.5">
                              <Phone className="w-2 h-2 fill-current" />
                              <p className="text-[7px] font-black">+91 7992237596</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 text-right z-10">
                          <div className="flex items-center justify-end gap-1 text-white">
                            <MapPin className="w-2 h-2" />
                            <p className="text-[7px] font-bold">Address .By pass Road ( Near Kali Mandir) Buxar</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col">
                      {/* Header */}
                      <div className="bg-[#002060] h-10 flex items-center px-4 relative overflow-hidden">
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border-2 border-[#FFC000] z-10">
                          <div className="text-[#002060] font-black text-[8px] text-center leading-none">ALPHA</div>
                        </div>
                        <div className="ml-2 z-10">
                          <h3 className="text-white text-sm font-black tracking-tight leading-none">ALPHA CLASSES</h3>
                          <p className="text-white text-[6px] font-bold tracking-widest">BUXAR</p>
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-[#FFC000] skew-x-[-30deg] translate-x-8"></div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 flex p-2 gap-4">
                        {/* Payment Table */}
                        <div className="flex-1 border border-[#002060]">
                          <table className="w-full text-[7px] border-collapse">
                            <thead>
                              <tr className="bg-[#0056b3] text-white">
                                <th className="border border-white p-0.5 w-6">No.</th>
                                <th className="border border-white p-0.5">Month</th>
                                <th className="border border-white p-0.5 w-6">
                                  <div className="w-2 h-2 border border-white mx-auto"></div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                'January', 'February', 'March', 'April', 'May', 'June',
                                'July', 'August', 'September', 'October', 'November', 'December'
                              ].map((month, i) => (
                                <tr key={month} className={i % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                                  <td className="border border-[#002060] p-0.5 text-center font-bold text-[#002060]">{i + 1}</td>
                                  <td className="border border-[#002060] p-0.5 font-bold text-[#002060]">{month}</td>
                                  <td className="border border-[#002060] p-0.5">
                                    <div className="w-2 h-2 border border-[#002060] mx-auto"></div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* QR Code Section */}
                        <div className="w-24 flex flex-col items-center justify-center">
                          <div className="p-1 border-2 border-black rounded">
                            <QRCodeSVG value={selectedStudent.id!} size={70} />
                          </div>
                          <div className="bg-black text-white w-full text-[8px] font-black py-1 mt-2 text-center rounded flex items-center justify-center gap-1">
                            <Smartphone className="w-2 h-2" /> SCAN ME
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="h-8 relative flex items-center px-4">
                        <div className="absolute left-0 bottom-0 w-24 h-full bg-[#FFC000] skew-x-[30deg] -translate-x-4"></div>
                        <div className="absolute inset-0 bg-[#002060] -z-10"></div>
                        
                        <div className="z-10 flex items-center gap-1 text-black">
                          <div className="leading-none">
                            <p className="text-[6px] font-bold">DR.By DK Singh</p>
                            <div className="flex items-center gap-0.5">
                              <Phone className="w-1.5 h-1.5 fill-current" />
                              <p className="text-[6px] font-black">+91 7992237596</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 text-right z-10">
                          <div className="flex items-center justify-end gap-1 text-white">
                            <MapPin className="w-1.5 h-1.5" />
                            <p className="text-[6px] font-bold">Address .By pass Road ( Near Kali Mandir) Buxar</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 gap-4">
                <Button onClick={downloadIDCard} className="w-full h-14">
                  <Download className="w-5 h-5" /> Download ID Card
                </Button>
                <Button onClick={shareIDCard} variant="secondary" className="w-full h-14">
                  <Share2 className="w-5 h-5" /> Share on WhatsApp
                </Button>
                {user?.email === 'santoshsantoshsingh597@gmail.com' && (
                  <Button onClick={() => togglePayment(selectedStudent)} className="w-full h-14 bg-zinc-900 text-yellow-400 border border-zinc-800">
                    <CreditCard className="w-5 h-5" /> 
                    Mark as {selectedStudent.paymentStatus === 'FULL PAID' ? 'PENDING' : 'FULL PAID'}
                  </Button>
                )}
              </div>

              {/* Full Details List */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-lg">Full Information</h3>
                  <button 
                    onClick={() => {
                      const text = `Name: ${selectedStudent.fullName}\nFather: ${selectedStudent.fatherName}\nClass: ${selectedStudent.class}\nMobile: ${selectedStudent.mobileNumber}\nAddress: ${selectedStudent.address}`;
                      navigator.clipboard.writeText(text);
                      alert("Details copied to clipboard!");
                    }}
                    className="flex items-center gap-2 text-xs font-bold text-yellow-400"
                  >
                    <Copy className="w-4 h-4" /> Copy All
                  </button>
                </div>
                <div className="grid gap-4 text-sm">
                  {[
                    { label: 'Mother', value: selectedStudent.motherName },
                    { label: 'Address', value: selectedStudent.address },
                    { label: 'Alt Mobile', value: selectedStudent.alternateNumber },
                    { label: 'Admission Date', value: selectedStudent.createdAt?.toDate().toLocaleDateString() },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between border-b border-zinc-800 pb-2">
                      <span className="text-zinc-500 font-bold uppercase text-xs">{item.label}</span>
                      <span className="font-medium">{item.value || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation (Mobile Style) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-zinc-800 px-8 py-4 flex justify-around items-center z-50">
        <button onClick={() => setView('home')} className={cn("p-2 rounded-xl transition-all", view === 'home' ? "text-yellow-400" : "text-zinc-500")}>
          <LayoutDashboard className="w-6 h-6" />
        </button>
        <button onClick={() => setView('admission')} className={cn("p-2 rounded-xl transition-all", view === 'admission' ? "text-yellow-400" : "text-zinc-500")}>
          <User className="w-6 h-6" />
        </button>
        <button onClick={() => setView('admin')} className={cn("p-2 rounded-xl transition-all", view === 'admin' ? "text-yellow-400" : "text-zinc-500")}>
          <Edit className="w-6 h-6" />
        </button>
      </nav>
    </div>
  );
}
