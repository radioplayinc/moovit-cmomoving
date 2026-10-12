# CMO Moving CRM — include leads & quote requests in Sheet + email alerts

## The gap (verified 2026-10-12 ~15:55 UTC)

Basqi asked: "I mean the email notifications for when someone signs up. I need
their info and data as an email. And I want I as a Google Sheets for our CRM."

The shipped implementation (commit `4cc02e4`: `apps-script-crm.js` +
`functions/api/notify-booking.js` Sheets/Gmail forwarding) only fires for
**paid bookings**. Two other signup events never reach the Sheet or the inbox:

1. **Leads** — the contact-first flow auto-saves abandoners to Supabase as
   `status='lead'` via `saveLead()` (`index.html` ~line 267), but `saveLead()`
   never calls `/api/notify-booking`. These are the exact people the
   contact-first flow was built to capture — the broker's hottest follow-ups —
   and they currently vanish into Supabase with no alert and no CRM row.
2. **Quote requests** — `completeBooking` saves `status='quote'` when the user
   picks "Send quote only", but the `if(state.lockChoice!=='Send quote only')`
   guard (~line 317) skips the notify call entirely.

Additionally `notify-booking.js` hardcodes `status: 'confirmed'` when forwarding
to the Apps Script, so even if the site sent other statuses they'd be
mislabelled, and the Gmail subject always says "New CMO Moving booking".

## The fix — 4 small patches

### Patch 1 — `index.html`: `saveLead()` also pings notify

Old:
```js
      card_last4:null,
      answers:state
    });
  }
```
New (insert before the closing `}` of `saveLead`):
```js
      card_last4:null,
      answers:state
    });
    try{
      fetch('/api/notify-booking',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
        body:JSON.stringify({ref:'LEAD-'+Date.now().toString(36).toUpperCase(),status:'lead',
          name:state.custName||'',phone:state.custPhone||'',email:state.custEmail||'',
          size:state.moveSize||'',moveType:state.moveType||'',
          fromZip:state.fromZip||'',toZip:state.toZip||'',
          date:formatDate(state.moveDate),time:state.timeWindow||'',
          stairs:state.stairs||'',packing:state.packing||'',heavy:state.heavy||'',
          estimate:state.base?estimate():null})
      }).catch(function(){});
    }catch(e){}
  }
```
Notes: mirrors the `state.base?estimate():null` guard from the Supabase save
(`estimate()` defaults base to 380, so the guard is required). `formatDate`
and `estimate` are in the same IIFE scope — verified.

### Patch 2 — `index.html`: `completeBooking` notifies on quotes too

Old:
```js
    if(state.lockChoice!=='Send quote only'){
      state.bookingRef='MV-'+Math.floor(1000+Math.random()*9000);
      try{
        fetch('/api/notify-booking',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
          body:JSON.stringify({ref:state.bookingRef,
            name:state.custName||'',phone:state.custPhone||'',email:state.custEmail||'',
            size:state.moveSize||'',moveType:state.moveType||'',
            fromZip:state.fromZip||'',toZip:state.toZip||'',
            date:formatDate(state.moveDate),time:state.timeWindow||'',
            stairs:state.stairs||'',packing:state.packing||'',heavy:state.heavy||'',
            estimate:estimate()})
        }).catch(function(){});
      }catch(e){}
    }
```
New:
```js
    state.bookingRef='MV-'+Math.floor(1000+Math.random()*9000);
    try{
      fetch('/api/notify-booking',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
        body:JSON.stringify({ref:state.bookingRef,
          status:(state.lockChoice==='Send quote only')?'quote':'confirmed',
          name:state.custName||'',phone:state.custPhone||'',email:state.custEmail||'',
          size:state.moveSize||'',moveType:state.moveType||'',
          fromZip:state.fromZip||'',toZip:state.toZip||'',
          date:formatDate(state.moveDate),time:state.timeWindow||'',
          stairs:state.stairs||'',packing:state.packing||'',heavy:state.heavy||'',
          estimate:estimate()})
      }).catch(function(){});
    }catch(e){}
```
Safe: the confirm screen (line 250) already falls back to a random ref if
`state.bookingRef` is unset, so setting it in the quote path only makes the
displayed ref match the notified ref.

### Patch 3 — `functions/api/notify-booking.js`: pass status through

Old:
```js
            ref: (b.ref || '').trim(), status: 'confirmed',
```
New:
```js
            ref: (b.ref || '').trim(),
            status: (b.status === 'lead' || b.status === 'quote') ? b.status : 'confirmed',
```
Optional (cosmetic): the push/Resend title
```js
const title = `New CMO Moving booking ${(b.ref || '').trim()}`.trim();
```
→
```js
const kind = b.status === 'lead' ? 'lead' : b.status === 'quote' ? 'quote request' : 'booking';
const title = `New CMO Moving ${kind} ${(b.ref || '').trim()}`.trim();
```

### Patch 4 — `apps-script-crm.js`: status-aware Gmail subject

Old:
```js
    MailApp.sendEmail({
      to: BROKER_EMAIL,
      subject: 'New CMO Moving booking ' + (b.ref || ''),
      body: buildEmail(b)
    });
```
New:
```js
    var kind = b.status === 'lead' ? 'lead' : b.status === 'quote' ? 'quote request' : 'booking';
    MailApp.sendEmail({
      to: BROKER_EMAIL,
      subject: 'New CMO Moving ' + kind + ' ' + (b.ref || ''),
      body: buildEmail(b, kind)
    });
```
Old:
```js
function buildEmail(b) {
  var lines = [
    'New booking ' + (b.ref || ''),
```
New:
```js
function buildEmail(b, kind) {
  var lines = [
    'New ' + (kind || 'booking') + ' ' + (b.ref || ''),
```
The Sheet needs no change — it already writes `b.status || 'confirmed'`,
so leads/quotes land in the Status column automatically.

## Known behaviors (not bugs)

- A person who abandons (lead row) and later completes (confirmed row) in a
  new session produces two Sheet rows. Acceptable for a small CRM; dedupe by
  phone if it ever matters.
- `saveLead` fires on pagehide/visibilitychange, so repeat abandoners can
  generate multiple lead emails. Fine at this volume.

## To apply

1. Apply the 4 patches, push (one-time GitHub PAT), Cloudflare auto-deploys.
2. Basqi re-pastes the updated `apps-script-crm.js` into his Apps Script
   (subject/body change only) — or skip if he only wants paid bookings.
