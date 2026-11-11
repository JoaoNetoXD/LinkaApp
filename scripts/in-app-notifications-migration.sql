BEGIN;

CREATE OR REPLACE FUNCTION public.notify_admin_of_pending_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' OR NEW.deleted_at IS NOT NULL
     OR (TG_OP = 'UPDATE' AND OLD.status = 'pending') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, institution_id, title, body, type, action_url)
  SELECT p.id, NEW.institution_id, 'Oferta para revisar',
         format('A oferta "%s" aguarda aprovação.', NEW.title), 'info', '#/admin/moderation'
  FROM public.profiles p
  WHERE p.id <> NEW.seller_id
    AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.institution_id = NEW.institution_id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_buyer_of_coupon_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT ((TG_OP = 'INSERT' AND NEW.status IS NOT DISTINCT FROM 'active')
          OR (TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM 'used' AND OLD.status IS DISTINCT FROM 'used')) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, institution_id, title, body, type, action_url)
  SELECT NEW.buyer_id, p.institution_id,
         CASE WHEN NEW.status = 'used' THEN 'Cupom usado' ELSE 'Cupom retirado' END,
         CASE WHEN NEW.status = 'used' THEN format('Seu cupom de "%s" foi validado.', p.title)
              ELSE format('Seu cupom de "%s" está disponível em Meus cupons.', p.title) END,
         'success', '#/buyer/coupons'
  FROM public.products p
  WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admin_of_pending_offer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_buyer_of_coupon_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_admin_of_pending_offer ON public.products;
CREATE TRIGGER notify_admin_of_pending_offer
AFTER INSERT OR UPDATE OF status ON public.products
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_of_pending_offer();

DROP TRIGGER IF EXISTS notify_buyer_of_coupon_event ON public.coupons;
CREATE TRIGGER notify_buyer_of_coupon_event
AFTER INSERT OR UPDATE OF status ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.notify_buyer_of_coupon_event();

COMMIT;
