import { useState, useEffect } from 'react';
import { X, CreditCard, Loader2, AlertCircle, ChevronDown, ChevronUp, Tag, ExternalLink } from 'lucide-react';
import { PAYSTACK_PRODUCTS, type PaystackProduct } from '@/lib/paystack';
import { paymentsService, type PaymentSession } from '@/services/payments/payments-service';
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
import { openHashRouteUrl } from '@/utils/appUrls';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  productKey: keyof typeof PAYSTACK_PRODUCTS;
  onSuccess?: () => void;
}

export function PaymentModal({ isOpen, onClose, productKey, onSuccess }: PaymentModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [isPromoOpen, setIsPromoOpen] = useState(false);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<any>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [finalPrice, setFinalPrice] = useState(0);
  const { user, fetchUserPlan } = useAuthStore();
  const { toast } = useToast();

  const product = PAYSTACK_PRODUCTS[productKey];
  const currentPrice = finalPrice || product.price;

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
          onSuccess?.();
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

      await handlePaystackPayment(productKey);

    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaystackPayment = async (paystackProductKey: keyof typeof PAYSTACK_PRODUCTS) => {
    try {
      // Create transaction using the abstract payments service
      const transactionData = await paymentsService.createTransaction(
        paystackProductKey,
        user.id,
        {
          promo_code: promoCode,
          discount_amount: discountAmount
        }
      );

      if (!transactionData.status) {
        throw new Error('Failed to initialize payment');
      }

      // Launch payment using the abstract service
      paymentsService.redirectToPayment(transactionData.data);

    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to initialize payment');
    }
  };

  const getPlanTypeFromProductKey = (productKey: string): string => {
    const productMapping: Record<string, string> = {
      'PRO_SUBSCRIPTION': 'premium',
      'LIFETIME': 'enterprise',
      'STORAGE_10GB': 'basic'
    };
    return productMapping[productKey] || 'basic';
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
            productKey
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
            productKey,
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

  // Listen for successful payment return
  useEffect(() => {
    const handlePaymentSuccess = async (event: MessageEvent) => {
      if (event.data.type === 'PAYMENT_SUCCESS') {
        // Refresh user plan after successful payment
        if (user) {
          await fetchUserPlan(user.id);
        }
        onSuccess?.();
        handleClose();
      }
    };

    window.addEventListener('message', handlePaymentSuccess);
    return () => window.removeEventListener('message', handlePaymentSuccess);
  }, [user, fetchUserPlan, onSuccess, handleClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Complete Purchase
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Product Details */}
          <div className="space-y-4">
            <div className="p-4 border border-glass-border/40 rounded-lg bg-glass/30">
              <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                {discountAmount > 0 ? (
                  <>
                    <span className="text-lg text-muted-foreground line-through">₦{product.price}</span>
                    <span className="text-2xl font-bold text-green-600">₦{currentPrice}</span>
                    <span className="text-sm text-green-600 ml-2">Save ₦{discountAmount}</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold">₦{currentPrice}</span>
                    {product.recurring && <span className="text-sm text-muted-foreground">/month</span>}
                  </>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                Storage: {product.storage}
              </div>
              {appliedPromo && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                  <div className="flex items-center gap-2 text-green-700">
                    <Tag className="w-4 h-4" />
                    Promo code applied: {appliedPromo.code}
                  </div>
                  {appliedPromo.type === 'free_plan' && (
                    <div className="text-green-600 mt-1">Free plan granted!</div>
                  )}
                </div>
              )}
            </div>

            {/* Promo Code Section */}
            <Collapsible open={isPromoOpen} onOpenChange={setIsPromoOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between text-sm"
                  disabled={!!appliedPromo}
                >
                  <span className="flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    {appliedPromo ? 'Promo code applied' : 'Have a promo code?'}
                  </span>
                  {isPromoOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label htmlFor="promo-code">Promo Code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="promo-code"
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      disabled={isApplyingPromo || !!appliedPromo}
                      className="flex-1"
                    />
                    {!appliedPromo ? (
                      <Button
                        onClick={validatePromoCode}
                        disabled={!promoCode.trim() || isApplyingPromo}
                        size="sm"
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
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Payment Info */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              A secure payment popup will open to complete your payment.
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>By continuing, you agree to our:</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openHashRouteUrl('/terms-of-service')}
                  className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Terms of Service
                </Button>
                <span>•</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openHashRouteUrl('/privacy-policy')}
                  className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Privacy Policy
                </Button>
                <span>•</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openHashRouteUrl('/refund-policy')}
                  className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Refund Policy
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={isProcessing || !user}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {appliedPromo?.type === 'free_plan' ? 'Granting...' : 'Processing...'}
              </>
            ) : appliedPromo?.type === 'free_plan' ? (
              <>
                <Tag className="w-4 h-4 mr-2" />
                Grant Free Plan
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay ₦{currentPrice}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
