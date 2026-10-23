# Free-tier credit model

This configuration assumes the Google Maps billing account qualifies for India pricing. Verify the billed SKU and monthly allowance in Google Cloud Billing before using these limits in production.

| Credit group | India free requests/month | Internal credits/request | App stop (90%) |
|---|---:|---:|---:|
| Essentials | 70,000 | 1 | 63,000 requests |
| Pro | 35,000 | 4 | 31,500 requests |
| Enterprise | 7,000 | 10 | 6,300 requests |

The current Text Search field mask requests reviews, so those calls are billed as **Text Search Enterprise + Atmosphere**. They appear in the Enterprise group and in a separate Atmosphere request counter. This is not an additional 7,000-request allowance for the same call.

The combined display pool is 280,000 weighted credits: 70,000 + 140,000 + 70,000. Its 90% display stop is 252,000 credits. Every SKU also has its own 90% stop; an unused Essentials or Pro allowance cannot fund Enterprise requests. Cached searches consume no Google requests. Google charges actual API requests, not these internal credits.

Default user allocation is 2,000 credits/month. For 25 users, this reserves 50,000 of the 63,000 Enterprise credits available before the app stop and leaves 13,000 credits for admin usage and variation. At maximum search depth, one city pair costs 1,280 credits, neighbourhood 720, and specific area 320. Actual calls may be lower. A multi-keyword/multi-location search multiplies pairs. Admins can still grant credits and set a user to unlimited; unlimited only bypasses the user allowance, not platform limits. Existing users with a stored creditLimit retain that limit until an admin changes it.

The app reads its counter before a live sweep and checks the maximum possible requests. This conservatively blocks some searches before the exact 90% point. It cannot guarantee the free tier because Places requests are issued from browsers, counters are written after a search, and simultaneous users can read the same available balance. Configure Google Cloud quotas and billing alerts for the actual billed SKUs. To guarantee atomic application limits, move the API key and search execution to a server endpoint that reserves requests before calling Google. Compare app counters to Google Cloud Billing regularly; app counters cannot observe requests made outside this app.
