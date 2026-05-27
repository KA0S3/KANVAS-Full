import { useOutletContext } from "react-router-dom";

export function usePurchaseOutlet() {
  return useOutletContext<{ openPurchase: () => void }>();
}
