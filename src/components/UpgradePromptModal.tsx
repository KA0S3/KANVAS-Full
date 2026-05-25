import React, { useState, useEffect } from 'react';
import { X, Crown, Zap, User, CreditCard, Loader2, AlertCircle, Tag, ChevronDown, ChevronUp, Database, Shield, Globe, BookOpen, CheckCircle, Star, Sparkles, Lock, Cloud, FileText, HardDrive } from 'lucide-react';
import { PAYSTACK_PRODUCTS, type PaystackProduct } from '@/lib/paystack';
import { createTransaction, launchPaystackInline, verifyTransaction, type PaystackSession } from '@/services/payments/paystack';
import { supabase } from '@/lib/supabase';
import { USE_SUPABASE } from '@/config/features';
import { useAuthStore } from '@/stores/authStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { AccountModal } from '@/components/account/AccountModal';

interface UpgradePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  action: string;
  onAction?: () => void;
  type: 'guest' | 'plan_limit';
}

interface PromoCodeData {
  code: string;
  valid: boolean;
  discountAmount?: number;
  adjustedPrice?: number;
  type?: 'percentage' | 'fixed' | 'free_plan';
  error?: string;
}

export function UpgradePromptModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  action,
  onAction,
  type
}: UpgradePromptModalProps) {
  if (!isOpen) return null;

  const { user, plan, fetchUserPlan } = useAuthStore();
  
  // Safe owner check with error handling
  let isOwner = plan === 'owner'; // Default to plan-based check
  try {
    const ownerEmail = import.meta.env?.VITE_OWNER_EMAIL;
    if (ownerEmail && user?.email === ownerEmail) {
      isOwner = true;
    }
  } catch (error) {
    console.warn('[UpgradePromptModal] Error checking owner status:', error);
  }
  
  // OWNER CHECK: Do not show upgrade modal to owners
  if (isOwner) {
    return null;
  }
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [isPromoOpen, setIsPromoOpen] = useState(false);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<PromoCodeData | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [finalPrice, setFinalPrice] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<keyof typeof PAYSTACK_PRODUCTS>('PRO_SUBSCRIPTION');
  const [selectedCard, setSelectedCard] = useState<'pro' | 'lifetime' | 'free' | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  
  const { toast } = useToast();

  const product = PAYSTACK_PRODUCTS[selectedProduct];
  const currentPrice = finalPrice || product.price;

  const premiumFeatures = [
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Ad-Free Experience",
      description: "Enjoy uninterrupted creativity without ads",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: <Cloud className="w-5 h-5" />,
      title: "Cloud Sync & Backup",
      description: "Automatic backups and seamless cross-device sync",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      icon: <FileText className="w-5 h-5" />,
      title: "Unlimited Books",
      description: "Create unlimited books, worlds, and campaigns",
      gradient: "from-green-500 to-emerald-500"
    },
    {
      icon: <HardDrive className="w-5 h-5" />,
      title: "Expanded Storage",
      description: "10GB cloud storage with upgrade options",
      gradient: "from-orange-500 to-red-500"
    },
    {
      icon: <Globe className="w-5 h-5" />,
      title: "Full Import/Export",
      description: "Complete data portability and backup control",
      gradient: "from-indigo-500 to-purple-500"
    },
    {
      icon: <Sparkles className="w-5 h-5" />,
      title: "Premium Features",
      description: "Access to all advanced tools and capabilities",
      gradient: "from-amber-500 to-yellow-500"
    }
  ];

  const freeFeatures = [
    {
      icon: <FileText className="w-3 h-3" />,
      title: "1 Book",
      description: "Create up to 1 book"
    },
    {
      icon: <Cloud className="w-3 h-3" />,
      title: "100MB Cloud Backup",
      description: "Sign in to access cloud backup"
    },
    {
      icon: <Globe className="w-3 h-3" />,
      title: "Text Export Only",
      description: "Export without images"
    }
  ];

  const handlePayment = async () => {
    if (!user) {
      setError('You must be signed in to make a purchase');
      return;
    }

    if (!USE_SUPABASE) {
      setError('Purchases are disabled when USE_SUPABASE=false');
      return;
    }

    // If we have an applied free plan promo, bypass payment
    if (appliedPromo && appliedPromo.type === 'free_plan') {
      setIsProcessing(true);
      setError(null);
      
      try {
        const result = await applyPromoCode();
        if (result.success) {
          toast({
            title: "Success!",
            description: result.message,
          });
          await fetchUserPlan(user.id);
          onAction?.();
          handleClose();
        } else {
          setError(result.error || 'Failed to apply promo code');
        }
      } catch (err) {
        console.error('Promo application error:', err);
        setError(err instanceof Error ? err.message : 'Failed to apply promo code');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Get auth session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      await handlePaystackPayment(selectedProduct);

    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaystackPayment = async (productKey: keyof typeof PAYSTACK_PRODUCTS) => {
    try {
      // Create Paystack transaction using new service
      const transactionData = await createTransaction(
        productKey,
        user.id,
        {
          promo_code: promoCode,
          discount_amount: discountAmount
        }
      );

      if (!transactionData.status) {
        throw new Error('Failed to initialize Paystack payment');
      }

      // Launch Paystack inline payment
      const session: PaystackSession = {
        reference: transactionData.data.reference,
        authorization_url: transactionData.data.authorization_url,
        access_code: transactionData.data.access_code
      };
      
      launchPaystackInline(session);

    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to initialize Paystack payment');
    }
  };

  const handleClose = () => {
    setError(null);
    setIsProcessing(false);
    setPromoCode('');
    setAppliedPromo(null);
    setDiscountAmount(0);
    setFinalPrice(0);
    setIsPromoOpen(false);
    onClose();
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim() || !user) return;

    if (!USE_SUPABASE) {
      setError('Promo codes are disabled when USE_SUPABASE=false');
      return;
    }

    setIsApplyingPromo(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-promo`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: promoCode,
            userId: user.id,
            productKey: selectedProduct
          })
        }
      );

      const result = await response.json();

      if (result.valid) {
        setAppliedPromo(result.promoCode);
        setDiscountAmount(result.discountAmount || 0);
        setFinalPrice(result.adjustedPrice || product.price);
        toast({
          title: "Promo Code Applied!",
          description: result.discountAmount 
            ? `You saved ₦${result.discountAmount}`
            : "Promo code applied successfully",
        });
      } else {
        setError(result.error || 'Invalid promo code');
      }
    } catch (err) {
      console.error('Promo validation error:', err);
      setError('Failed to validate promo code');
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const applyPromoCode = async () => {
    if (!appliedPromo || !user) {
      return { success: false, error: 'No promo code applied' };
    }

    if (!USE_SUPABASE) {
      return { success: false, error: 'Promo codes are disabled when USE_SUPABASE=false' };
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apply-promo`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: appliedPromo.code,
            userId: user.id,
            productKey: selectedProduct,
            originalPrice: product.price
          })
        }
      );

      const result = await response.json();
      return result;
    } catch (err) {
      console.error('Promo application error:', err);
      return { success: false, error: 'Failed to apply promo code' };
    }
  };

  const removePromoCode = () => {
    setPromoCode('');
    setAppliedPromo(null);
    setDiscountAmount(0);
    setFinalPrice(0);
  };

  const handleStorageAddon = () => {
    // Open storage addon purchase
    setSelectedProduct('STORAGE_10GB');
  };

  // Listen for successful payment return
  useEffect(() => {
    const handlePaymentSuccess = async (event: MessageEvent) => {
      if (event.data.type === 'PAYSTACK_SUCCESS') {
        // Refresh user plan after successful payment
        if (user) {
          await fetchUserPlan(user.id);
        }
        onAction?.();
        handleClose();
      }
    };

    window.addEventListener('message', handlePaymentSuccess);
    return () => window.removeEventListener('message', handlePaymentSuccess);
  }, [user, fetchUserPlan, onAction, handleClose]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl w-[95vw] glass cosmic-glow border-glass-border/40 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Simple Header */}
        <DialogHeader className="pb-4 text-center">
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            {title}
          </DialogTitle>
          {type === 'guest' && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium">
              <AlertCircle className="w-3 h-3" />
              Guest Session
            </div>
          )}
          <p className="text-muted-foreground mt-2 text-sm">{message}</p>
        </DialogHeader>

        {/* Main Content - 3 Column Grid */}
        <div className="flex-1 overflow-y-auto pb-32">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
            
            {/* Free Forever Card */}
            <div 
              className={`relative group transition-all duration-300 ${selectedCard === 'free' ? 'scale-[1.02] -translate-y-2' : ''}`}
              onClick={() => {
                setSelectedCard('free');
                setSelectedProduct('PRO_SUBSCRIPTION'); // Reset to default
              }}
            >
              <div className={`relative bg-white/5 dark:bg-gray-800/5 backdrop-blur-sm border rounded-xl p-6 hover:bg-white/10 dark:hover:bg-gray-700/10 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer ${
                selectedCard === 'free' 
                  ? 'border-gray-400 shadow-xl shadow-gray-400/20 bg-gradient-to-br from-gray-400/10 to-gray-500/10' 
                  : 'border border-white/10 dark:border-gray-700/20'
              }`}>
                <div className="text-center mb-6">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3 transition-all duration-300 ${
                    selectedCard === 'free'
                      ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg shadow-gray-500/30'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    CURRENT PLAN
                  </div>
                  <h3 className="text-xl font-bold mb-2">Free Forever</h3>
                  <div className="text-3xl font-bold mb-1">$0</div>
                  <div className="text-sm text-muted-foreground">forever</div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <BookOpen className="w-4 h-4 text-gray-500" />
                    <span>1 Book</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Cloud className="w-4 h-4 text-gray-500" />
                    <span>100MB Storage</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Shield className="w-4 h-4 text-gray-500" />
                    <span>With Ads</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Zap className="w-4 h-4 text-gray-500" />
                    <span>Basic Updates</span>
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!user) {
                      setShowAccountModal(true);
                    } else {
                      setSelectedCard('free');
                      setSelectedProduct('PRO_SUBSCRIPTION'); // Reset to default
                    }
                  }}
                  className={`w-full mt-6 py-3 px-4 rounded-lg font-medium transition-all duration-300 ${
                    selectedCard === 'free'
                      ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg shadow-gray-500/30 hover:from-gray-600 hover:to-gray-700'
                      : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 border border-gray-500/30'
                  }`}
                >
                  {user ? (selectedCard === 'free' ? 'Selected' : 'Continue with Free') : 'Sign In'}
                </button>
              </div>
            </div>

            {/* Pro Card */}
            <div 
              className={`relative group transition-all duration-300 ${selectedCard === 'pro' ? 'scale-[1.02] -translate-y-2' : ''}`}
              onClick={() => {
                setSelectedProduct('PRO_SUBSCRIPTION');
                setSelectedCard('pro');
              }}
            >
              <div className={`relative bg-white/5 dark:bg-gray-800/5 backdrop-blur-sm border-2 rounded-xl p-6 hover:bg-white/10 dark:hover:bg-gray-700/10 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] hover:border-teal-500/70 dark:hover:border-teal-400/70 transition-all duration-300 cursor-pointer ${
                selectedCard === 'pro' 
                  ? 'border-teal-500 shadow-xl shadow-teal-500/20 bg-gradient-to-br from-teal-500/10 to-cyan-500/10' 
                  : 'border-teal-500/50 dark:border-teal-400/50'
              }`}>
                <div className="text-center mb-6">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3 transition-all duration-300 ${
                    selectedCard === 'pro'
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/30'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    POPULAR
                  </div>
                  <h3 className="text-xl font-bold mb-2">Pro</h3>
                  <div className="text-3xl font-bold mb-1">$5</div>
                  <div className="text-sm text-muted-foreground">per month</div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <BookOpen className="w-4 h-4 text-gray-500" />
                    <span>Unlimited Books</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Cloud className="w-4 h-4 text-gray-500" />
                    <span>10GB Storage</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Shield className="w-4 h-4 text-gray-500" />
                    <span>Ad-Free</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Zap className="w-4 h-4 text-gray-500" />
                    <span>Priority Support</span>
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProduct('PRO_SUBSCRIPTION');
                    setSelectedCard('pro');
                  }}
                  className={`w-full mt-6 py-3 px-4 rounded-lg font-medium transition-all duration-300 ${
                    selectedCard === 'pro'
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/30 hover:from-teal-600 hover:to-cyan-600'
                      : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 border border-gray-500/30'
                  }`}
                >
                  {selectedCard === 'pro' ? 'Selected' : 'Select Pro'}
                </button>
              </div>
            </div>

            {/* Lifetime Card */}
            <div 
              className={`relative group transition-all duration-300 ${selectedCard === 'lifetime' ? 'scale-[1.02] -translate-y-2' : ''}`}
              onClick={() => {
                setSelectedProduct('LIFETIME');
                setSelectedCard('lifetime');
              }}
            >
              <div className={`relative bg-white/5 dark:bg-gray-800/5 backdrop-blur-sm border-2 rounded-xl p-6 hover:bg-white/10 dark:hover:bg-gray-700/10 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] hover:border-amber-500/70 dark:hover:border-yellow-400/70 transition-all duration-300 cursor-pointer ${
                selectedCard === 'lifetime' 
                  ? 'border-amber-500 shadow-xl shadow-amber-500/20 bg-gradient-to-br from-amber-500/10 to-yellow-500/10' 
                  : 'border-amber-500/50 dark:border-yellow-400/50'
              }`}>
                <div className="text-center mb-6">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3 transition-all duration-300 ${
                    selectedCard === 'lifetime'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/30'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    BEST VALUE
                  </div>
                  <h3 className="text-xl font-bold mb-2">Lifetime</h3>
                  <div className="text-3xl font-bold mb-1">$80</div>
                  <div className="text-sm text-muted-foreground">pay once</div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <BookOpen className="w-4 h-4 text-gray-500" />
                    <span>Unlimited Books</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Cloud className="w-4 h-4 text-gray-500" />
                    <span>15GB Storage</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Shield className="w-4 h-4 text-gray-500" />
                    <span>Ad-Free</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Crown className="w-4 h-4 text-gray-500" />
                    <span>Lifetime Updates</span>
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProduct('LIFETIME');
                    setSelectedCard('lifetime');
                  }}
                  className={`w-full mt-6 py-3 px-4 rounded-lg font-medium transition-all duration-300 ${
                    selectedCard === 'lifetime'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/30 hover:from-amber-600 hover:to-yellow-600'
                      : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 border border-gray-500/30'
                  }`}
                >
                  {selectedCard === 'lifetime' ? 'Selected' : 'Select Lifetime'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer - Promo Code & Payment */}
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-border/20 p-4">
          <div className="max-w-4xl mx-auto space-y-3">
            {/* Promo Code Section */}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Promo code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  disabled={isApplyingPromo || !!appliedPromo}
                  className="h-10 bg-background/50 border-muted/50"
                />
                {!appliedPromo ? (
                  <Button
                    onClick={validatePromoCode}
                    disabled={!promoCode.trim() || isApplyingPromo}
                    size="sm"
                    variant="outline"
                    className="h-10"
                  >
                    {isApplyingPromo ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Apply'
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={removePromoCode}
                    variant="outline"
                    size="sm"
                    className="h-10"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Applied Promo Display */}
            {appliedPromo && (
              <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700/30 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Promo code applied: {appliedPromo.code}</span>
                </div>
                {appliedPromo.type === 'free_plan' && (
                  <div className="text-green-600 dark:text-green-400 mt-1 font-medium text-sm">
                    🎉 Free plan granted!
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="text-green-600 dark:text-green-400 mt-1 font-medium text-sm">
                    You saved ₦{discountAmount}
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
                className="flex-1 h-12 font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePayment}
                disabled={isProcessing || !user || !selectedCard || selectedCard === 'free'}
                className={`flex-1 h-12 font-semibold transition-all duration-300 ${
                  !selectedCard || selectedCard === 'free'
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    : selectedCard === 'pro'
                    ? 'bg-gradient-to-r from-teal-400 to-cyan-400 hover:from-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-teal-400/30'
                    : selectedCard === 'lifetime'
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-white shadow-lg shadow-amber-400/30'
                    : 'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {appliedPromo?.type === 'free_plan' ? 'Granting...' : 'Processing...'}
                  </>
                ) : !selectedCard || selectedCard === 'free' ? (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Select a Plan
                  </>
                ) : appliedPromo?.type === 'free_plan' ? (
                  <>
                    <Tag className="w-4 h-4 mr-2" />
                    Grant Free Plan
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Upgrade ${selectedCard === 'pro' ? (finalPrice || 5) : (finalPrice || 80)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      
      {/* Account Modal */}
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />
    </Dialog>
  );
}
