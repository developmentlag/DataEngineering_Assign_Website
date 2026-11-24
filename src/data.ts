export type Language = 'sql' | 'python'
export type Cell = string | number | boolean | null
export type TableData = { columns: { name: string; type: string }[]; rows: Cell[][] }
export type Dataset = { name: string; tables: Record<string, TableData>; input?: unknown }
export type Challenge = {
  id: number
  title: string
  difficulty: 'FOUNDATION' | 'INTERMEDIATE' | 'ADVANCED'
  tags: string[]
  prompt: string
  constraints: string[]
  contract: string
  hints: string[]
  solution: string
  explanation: string
  starter: string
  datasets: Dataset[]
}

const table = (columns: [string, string][], rows: Cell[][]): TableData => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows,
})

const sqlChallenges: Challenge[] = [
  {
    id: 1, title: 'Regional revenue leaders', difficulty: 'ADVANCED', tags: ['Aggregation', 'Filtering'],
    prompt: 'The sales team wants to compare paid order revenue by region. Return only regions with at least two paid orders and more than $150 in revenue.',
    constraints: ['Ignore pending and refunded orders.', 'Revenue is the sum of each qualifying order total.', 'Sort highest revenue first, then region A–Z.'],
    contract: 'region TEXT, paid_orders BIGINT, revenue DECIMAL',
    hints: ['Join orders to customers to get each customer’s region.', 'Filter the order status before grouping.', 'Use HAVING for conditions on aggregate values.'],
    solution: `SELECT c.region, COUNT(*) AS paid_orders, SUM(o.total) AS revenue
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.status = 'paid'
GROUP BY c.region
HAVING COUNT(*) >= 2 AND SUM(o.total) > 150
ORDER BY revenue DESC, region ASC`,
    explanation: 'Only paid orders count. The HAVING clause applies both minimums after aggregation, so a region with many small or unpaid orders cannot qualify.',
    starter: `-- Return region, paid_orders, revenue\nSELECT\nFROM orders o\nJOIN customers c ON c.customer_id = o.customer_id\nWHERE\nGROUP BY\nHAVING\nORDER BY`,
    datasets: [
      { name: 'Sample dataset', tables: {
        customers: table([['customer_id', 'INTEGER'], ['region', 'VARCHAR']], [[1, 'West'], [2, 'East'], [3, 'West'], [4, 'North'], [5, 'East']]),
        orders: table([['order_id', 'INTEGER'], ['customer_id', 'INTEGER'], ['status', 'VARCHAR'], ['total', 'DOUBLE']], [[101, 1, 'paid', 120], [102, 2, 'paid', 90], [103, 3, 'paid', 80], [104, 4, 'paid', 300], [105, 4, 'refunded', 200], [106, 5, 'pending', 70], [107, 2, 'paid', 75]]),
      }},
      { name: 'Edge cases', tables: {
        customers: table([['customer_id', 'INTEGER'], ['region', 'VARCHAR']], [[1, 'Central'], [2, 'Central'], [3, 'South'], [4, 'South'], [5, 'East']]),
        orders: table([['order_id', 'INTEGER'], ['customer_id', 'INTEGER'], ['status', 'VARCHAR'], ['total', 'DOUBLE']], [[201, 1, 'paid', 75], [202, 2, 'paid', 75], [203, 3, 'paid', 200], [204, 4, 'refunded', 90], [205, 5, 'paid', 150]]),
      }},
    ],
  },
  {
    id: 2, title: 'Second purchase window', difficulty: 'ADVANCED', tags: ['Window functions', 'Dates'],
    prompt: 'Find customers whose second completed order arrived within 30 days of their first completed order.',
    constraints: ['Use only completed orders.', 'Timestamps can tie; order by order_id to break ties.', 'Include the first and second order dates.'],
    contract: 'customer_id INTEGER, first_order DATE, second_order DATE',
    hints: ['Rank completed orders per customer.', 'A self-join is also possible, but ranking is concise.', 'Compare the first two rows only, then calculate the date difference.'],
    solution: `WITH ranked AS (
  SELECT customer_id, order_date::DATE AS order_date,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS rn
  FROM orders WHERE status = 'completed'
)
SELECT a.customer_id, a.order_date AS first_order, b.order_date AS second_order
FROM ranked a JOIN ranked b ON a.customer_id = b.customer_id AND b.rn = 2
WHERE a.rn = 1 AND b.order_date - a.order_date <= 30
ORDER BY a.customer_id`,
    explanation: 'Ranking makes “first” and “second” unambiguous. Subtracting DATE values gives the gap in days; exactly 30 days is included.',
    starter: `-- Return customer_id, first_order, second_order\nWITH ranked AS (\n  SELECT\n  FROM orders\n  WHERE\n)\nSELECT\nFROM ranked\nWHERE\nORDER BY`,
    datasets: [
      { name: 'Sample dataset', tables: { orders: table([['order_id', 'INTEGER'], ['customer_id', 'INTEGER'], ['order_date', 'DATE'], ['status', 'VARCHAR']], [[1, 10, '2026-01-01', 'completed'], [2, 10, '2026-01-20', 'completed'], [3, 11, '2026-01-02', 'completed'], [4, 11, '2026-02-05', 'completed'], [5, 12, '2026-01-04', 'cancelled'], [6, 12, '2026-01-10', 'completed'], [7, 12, '2026-01-15', 'completed'], [8, 13, '2026-01-07', 'completed']]) } },
      { name: 'Edge cases', tables: { orders: table([['order_id', 'INTEGER'], ['customer_id', 'INTEGER'], ['order_date', 'DATE'], ['status', 'VARCHAR']], [[9, 20, '2026-03-01', 'completed'], [10, 20, '2026-03-31', 'completed'], [11, 21, '2026-03-01', 'completed'], [12, 21, '2026-04-01', 'completed'], [13, 22, '2026-03-04', 'completed'], [14, 22, '2026-03-04', 'completed'], [15, 23, '2026-03-04', 'pending'], [16, 23, '2026-03-08', 'completed']]) } },
    ],
  },
  {
    id: 3, title: 'Reorder watchlist', difficulty: 'FOUNDATION', tags: ['Filtering', 'Nulls'],
    prompt: 'Build a list of products that need replenishment and can be reordered from an active supplier.',
    constraints: ['A product is low when stock_on_hand is less than or equal to reorder_at.', 'Exclude discontinued products and inactive suppliers.', 'Sort by stock cover (lowest first), then product_id.'],
    contract: 'product_id INTEGER, product_name TEXT, stock_on_hand INTEGER, supplier_name TEXT',
    hints: ['Join the two tables on supplier_id.', 'Keep both status checks in the WHERE clause.', 'ORDER BY can use the stock count directly.'],
    solution: `SELECT p.product_id, p.product_name, p.stock_on_hand, s.supplier_name
FROM products p JOIN suppliers s ON p.supplier_id = s.supplier_id
WHERE p.stock_on_hand <= p.reorder_at
  AND p.discontinued = FALSE AND s.active = TRUE
ORDER BY p.stock_on_hand, p.product_id`,
    explanation: 'The low-stock boundary is inclusive. Supplier and product eligibility are checked before sorting the final watchlist.',
    starter: `-- Return products that need replenishment\nSELECT\nFROM products p\nJOIN suppliers s ON p.supplier_id = s.supplier_id\nWHERE\nORDER BY`,
    datasets: [
      { name: 'Sample dataset', tables: { products: table([['product_id', 'INTEGER'], ['product_name', 'VARCHAR'], ['stock_on_hand', 'INTEGER'], ['reorder_at', 'INTEGER'], ['discontinued', 'BOOLEAN'], ['supplier_id', 'INTEGER']], [[1, 'Cable', 5, 5, false, 1], [2, 'Stand', 2, 8, false, 2], [3, 'Case', 1, 4, true, 1], [4, 'Hub', 12, 10, false, 3]]), suppliers: table([['supplier_id', 'INTEGER'], ['supplier_name', 'VARCHAR'], ['active', 'BOOLEAN']], [[1, 'North Supply', true], [2, 'Metro Goods', false], [3, 'Acme Parts', true]]) } },
      { name: 'Edge cases', tables: { products: table([['product_id', 'INTEGER'], ['product_name', 'VARCHAR'], ['stock_on_hand', 'INTEGER'], ['reorder_at', 'INTEGER'], ['discontinued', 'BOOLEAN'], ['supplier_id', 'INTEGER']], [[5, 'Adapter', 0, 0, false, 4], [6, 'Dock', 4, 4, false, 4], [7, 'Old dock', 1, 8, true, 4], [8, 'Mouse', 2, 5, false, 5]]), suppliers: table([['supplier_id', 'INTEGER'], ['supplier_name', 'VARCHAR'], ['active', 'BOOLEAN']], [[4, 'City Wholesale', true], [5, 'Paused Partner', false]]) } },
    ],
  },
  {
    id: 4, title: 'Latest order status', difficulty: 'INTERMEDIATE', tags: ['Window functions', 'Deduplication'],
    prompt: 'Return the most recent status event for each order, excluding orders whose latest status is cancelled.',
    constraints: ['Choose the event with the newest changed_at timestamp.', 'Break timestamp ties with the greatest event_id.', 'Return one row per order.'],
    contract: 'order_id INTEGER, status TEXT, changed_at TIMESTAMP',
    hints: ['Rank status events by order.', 'Descending timestamp makes the newest event rank first.', 'Filter to rank 1 before excluding cancelled orders.'],
    solution: `WITH latest AS (
  SELECT order_id, status, changed_at,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY changed_at DESC, event_id DESC) AS rn
  FROM order_events
)
SELECT order_id, status, changed_at
FROM latest WHERE rn = 1 AND status <> 'cancelled'
ORDER BY order_id`,
    explanation: 'Cancellation is tested after selecting the latest event. Filtering cancelled events before ranking could incorrectly resurrect an older status.',
    starter: `-- Keep the latest event, then remove cancelled orders\nWITH latest AS (\n  SELECT *, ROW_NUMBER() OVER (\n    PARTITION BY order_id ORDER BY changed_at DESC, event_id DESC\n  ) AS rn\n  FROM order_events\n)\nSELECT\nFROM latest\nWHERE\nORDER BY`,
    datasets: [
      { name: 'Sample dataset', tables: { order_events: table([['event_id', 'INTEGER'], ['order_id', 'INTEGER'], ['status', 'VARCHAR'], ['changed_at', 'TIMESTAMP']], [[1, 100, 'created', '2026-04-01 09:00:00'], [2, 100, 'packed', '2026-04-01 10:00:00'], [3, 101, 'created', '2026-04-02 09:00:00'], [4, 101, 'cancelled', '2026-04-02 11:00:00'], [5, 102, 'shipped', '2026-04-03 14:00:00']]) } },
      { name: 'Edge cases', tables: { order_events: table([['event_id', 'INTEGER'], ['order_id', 'INTEGER'], ['status', 'VARCHAR'], ['changed_at', 'TIMESTAMP']], [[6, 200, 'created', '2026-05-01 08:00:00'], [7, 200, 'shipped', '2026-05-01 08:00:00'], [8, 201, 'pending', '2026-05-02 12:00:00'], [9, 201, 'cancelled', '2026-05-02 12:00:00'], [10, 202, 'created', '2026-05-03 10:00:00']]) } },
    ],
  },
  {
    id: 5, title: 'Weekly active accounts', difficulty: 'INTERMEDIATE', tags: ['Dates', 'Distinct counts'],
    prompt: 'Measure weekly active accounts based on at least one product event during a calendar week.',
    constraints: ['Count distinct account_id values, not events.', 'Use the Monday date as week_start.', 'Sort weeks chronologically.'],
    contract: 'week_start DATE, active_accounts BIGINT',
    hints: ['DuckDB date_trunc(week, ...) returns the Monday week boundary.', 'Cast the truncated timestamp to DATE.', 'COUNT(DISTINCT account_id) avoids duplicate events.'],
    solution: `SELECT DATE_TRUNC('week', event_date)::DATE AS week_start,
       COUNT(DISTINCT account_id) AS active_accounts
FROM product_events
GROUP BY 1
ORDER BY 1`,
    explanation: 'Grouping by the week boundary and counting distinct accounts prevents heavy users from inflating the weekly active measure.',
    starter: `-- One row per week\nSELECT\nFROM product_events\nGROUP BY\nORDER BY`,
    datasets: [
      { name: 'Sample dataset', tables: { product_events: table([['event_id', 'INTEGER'], ['account_id', 'INTEGER'], ['event_date', 'DATE']], [[1, 1, '2026-06-01'], [2, 1, '2026-06-02'], [3, 2, '2026-06-07'], [4, 3, '2026-06-08'], [5, 2, '2026-06-12']]) } },
      { name: 'Edge cases', tables: { product_events: table([['event_id', 'INTEGER'], ['account_id', 'INTEGER'], ['event_date', 'DATE']], [[6, 4, '2026-06-14'], [7, 5, '2026-06-15'], [8, 5, '2026-06-15'], [9, 6, '2026-06-21']]) } },
    ],
  },
  {
    id: 6, title: 'Normalized duplicate emails', difficulty: 'FOUNDATION', tags: ['String cleanup', 'Aggregation'],
    prompt: 'Find email addresses shared by multiple active members, ignoring whitespace and capitalization.',
    constraints: ['Normalize with trim and lowercase.', 'Ignore null or blank emails.', 'Return the number of active members for each normalized address.'],
    contract: 'email TEXT, member_count BIGINT',
    hints: ['Use LOWER(TRIM(email)) as the grouping key.', 'Filter blank values after trimming.', 'Aggregate only active members.'],
    solution: `SELECT LOWER(TRIM(email)) AS email, COUNT(*) AS member_count
FROM members
WHERE active = TRUE AND email IS NOT NULL AND TRIM(email) <> ''
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1
ORDER BY email`,
    explanation: 'Normalize before grouping so case and accidental surrounding spaces do not create separate identities.',
    starter: `-- Find duplicate normalized addresses\nSELECT\nFROM members\nWHERE\nGROUP BY\nHAVING\nORDER BY`,
    datasets: [
      { name: 'Sample dataset', tables: { members: table([['member_id', 'INTEGER'], ['email', 'VARCHAR'], ['active', 'BOOLEAN']], [[1, ' Sam@Example.com ', true], [2, 'sam@example.com', true], [3, 'pat@example.com', true], [4, 'pat@example.com', false], [5, null, true], [6, '   ', true]]) } },
      { name: 'Edge cases', tables: { members: table([['member_id', 'INTEGER'], ['email', 'VARCHAR'], ['active', 'BOOLEAN']], [[7, 'TEAM@example.org', true], [8, 'team@EXAMPLE.org ', true], [9, 'same@example.org', true], [10, 'same@example.org', true], [11, 'same@example.org', true], [12, null, false]]) } },
    ],
  },
  {
    id: 7, title: 'Cohort month retention', difficulty: 'ADVANCED', tags: ['Cohorts', 'Date arithmetic'],
    prompt: 'For each signup cohort, calculate the number of users who returned in their first full calendar month after signup.',
    constraints: ['Use the signup month as the cohort month.', 'A return is an activity event in the next calendar month.', 'Count each user only once per cohort.'],
    contract: 'cohort_month DATE, retained_users BIGINT, cohort_users BIGINT, retention_rate DOUBLE',
    hints: ['Truncate signup dates to month for cohort assignment.', 'Join activity to users, then compare activity month with cohort month + 1 month.', 'Divide retained cohort members by total users in the cohort.'],
    solution: `WITH cohorts AS (
  SELECT user_id, DATE_TRUNC('month', signup_date)::DATE AS cohort_month
  FROM users
), sizes AS (
  SELECT cohort_month, COUNT(*) AS cohort_users FROM cohorts GROUP BY 1
), retained AS (
  SELECT DISTINCT c.user_id, c.cohort_month
  FROM cohorts c JOIN activity a ON a.user_id = c.user_id
  WHERE DATE_TRUNC('month', a.activity_date)::DATE = (c.cohort_month + INTERVAL '1 month')::DATE
)
SELECT s.cohort_month, COUNT(r.user_id) AS retained_users, s.cohort_users,
       COUNT(r.user_id)::DOUBLE / s.cohort_users AS retention_rate
FROM sizes s LEFT JOIN retained r ON r.cohort_month = s.cohort_month
GROUP BY s.cohort_month, s.cohort_users
ORDER BY s.cohort_month`,
    explanation: 'The next month is a calendar month, not a 30-day window. DISTINCT retention rows protect the user count from repeated activity.',
    starter: `-- One row per signup cohort month\nWITH cohorts AS (\n  SELECT user_id, DATE_TRUNC('month', signup_date)::DATE AS cohort_month\n  FROM users\n), retained AS (\n  SELECT DISTINCT\n)\nSELECT\nFROM cohorts\nORDER BY`,
    datasets: [
      { name: 'Sample dataset', tables: { users: table([['user_id', 'INTEGER'], ['signup_date', 'DATE']], [[1, '2026-01-03'], [2, '2026-01-20'], [3, '2026-02-02'], [4, '2026-02-12']]), activity: table([['user_id', 'INTEGER'], ['activity_date', 'DATE']], [[1, '2026-02-01'], [1, '2026-02-20'], [2, '2026-03-01'], [3, '2026-03-03'], [4, '2026-02-28']]) } },
      { name: 'Edge cases', tables: { users: table([['user_id', 'INTEGER'], ['signup_date', 'DATE']], [[5, '2026-03-31'], [6, '2026-03-01'], [7, '2026-04-01']]), activity: table([['user_id', 'INTEGER'], ['activity_date', 'DATE']], [[5, '2026-04-01'], [5, '2026-04-30'], [6, '2026-05-01'], [7, '2026-05-31']]) } },
    ],
  },
  {
    id: 8, title: 'Top product in every category', difficulty: 'INTERMEDIATE', tags: ['Ranking', 'Aggregation'],
    prompt: 'Rank products by gross sales within each category and return the single best-selling product in each category.',
    constraints: ['Gross sales are quantity multiplied by unit_price.', 'Break ties using the product name alphabetically.', 'Include categories with sales only.'],
    contract: 'category TEXT, product_name TEXT, gross_sales DOUBLE',
    hints: ['Aggregate sales by category and product first.', 'Rank the aggregate inside each category.', 'Use ROW_NUMBER for a single winner after applying tie-breaks.'],
    solution: `WITH totals AS (
  SELECT category, product_name, SUM(quantity * unit_price) AS gross_sales
  FROM sales GROUP BY category, product_name
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY gross_sales DESC, product_name) AS rn
  FROM totals
)
SELECT category, product_name, gross_sales FROM ranked WHERE rn = 1
ORDER BY category`,
    explanation: 'Sales are summed at product/category grain before ranking. The explicit product-name tie-break guarantees one deterministic winner.',
    starter: `-- Aggregate first, then rank within category\nWITH totals AS (\n  SELECT\n  FROM sales\n  GROUP BY\n), ranked AS (\n  SELECT *, ROW_NUMBER() OVER (\n    PARTITION BY category ORDER BY\n  ) AS rn FROM totals\n)\nSELECT\nFROM ranked\nWHERE`,
    datasets: [
      { name: 'Sample dataset', tables: { sales: table([['category', 'VARCHAR'], ['product_name', 'VARCHAR'], ['quantity', 'INTEGER'], ['unit_price', 'DOUBLE']], [['Audio', 'Buds', 2, 40], ['Audio', 'Speaker', 1, 75], ['Audio', 'Buds', 1, 40], ['Office', 'Desk', 1, 200], ['Office', 'Lamp', 4, 50]]) } },
      { name: 'Edge cases', tables: { sales: table([['category', 'VARCHAR'], ['product_name', 'VARCHAR'], ['quantity', 'INTEGER'], ['unit_price', 'DOUBLE']], [['Home', 'A vase', 1, 100], ['Home', 'B bowl', 2, 50], ['Travel', 'Bag', 0, 90], ['Travel', 'Case', 1, 60]]) } },
    ],
  },
  {
    id: 9, title: 'Support tickets within SLA', difficulty: 'INTERMEDIATE', tags: ['Conditional logic', 'Percentages'],
    prompt: 'For each priority, report the share of resolved support tickets that met their response-time target.',
    constraints: ['Only resolved tickets belong in the denominator.', 'Targets: urgent 2 hours, normal 24 hours, low 72 hours.', 'Return a 0–1 rate, rounded to three decimals.'],
    contract: 'priority TEXT, resolved_tickets BIGINT, within_sla_rate DOUBLE',
    hints: ['Use CASE to map the priority to its hour limit.', 'Compare resolved_at minus created_at against that limit.', 'AVG over a boolean expression computes the share.'],
    solution: `SELECT priority, COUNT(*) AS resolved_tickets,
       ROUND(AVG(CASE
         WHEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600 <=
           CASE priority WHEN 'urgent' THEN 2 WHEN 'normal' THEN 24 ELSE 72 END
         THEN 1.0 ELSE 0.0 END), 3) AS within_sla_rate
FROM tickets
WHERE resolved_at IS NOT NULL
GROUP BY priority
ORDER BY priority`,
    explanation: 'Only resolved tickets are counted. The nested CASE assigns each priority its service target, and the average of 1/0 flags is the rate.',
    starter: `-- Group resolved ticket SLA performance by priority\nSELECT priority,\n       COUNT(*) AS resolved_tickets,\n       ROUND(AVG(CASE WHEN /* within SLA */ THEN 1.0 ELSE 0.0 END), 3) AS within_sla_rate\nFROM tickets\nWHERE\nGROUP BY priority\nORDER BY priority`,
    datasets: [
      { name: 'Sample dataset', tables: { tickets: table([['ticket_id', 'INTEGER'], ['priority', 'VARCHAR'], ['created_at', 'TIMESTAMP'], ['resolved_at', 'TIMESTAMP']], [[1, 'urgent', '2026-07-01 09:00:00', '2026-07-01 10:00:00'], [2, 'urgent', '2026-07-01 09:00:00', '2026-07-01 12:00:00'], [3, 'normal', '2026-07-01 09:00:00', '2026-07-02 09:00:00'], [4, 'normal', '2026-07-01 09:00:00', null], [5, 'low', '2026-07-01 09:00:00', '2026-07-04 10:00:00']]) } },
      { name: 'Edge cases', tables: { tickets: table([['ticket_id', 'INTEGER'], ['priority', 'VARCHAR'], ['created_at', 'TIMESTAMP'], ['resolved_at', 'TIMESTAMP']], [[6, 'urgent', '2026-07-02 10:00:00', '2026-07-02 12:00:00'], [7, 'normal', '2026-07-02 10:00:00', '2026-07-03 10:01:00'], [8, 'low', '2026-07-02 10:00:00', null], [9, 'low', '2026-07-02 10:00:00', '2026-07-05 10:00:00']]) } },
    ],
  },
  {
    id: 10, title: 'Active subscriptions at month end', difficulty: 'ADVANCED', tags: ['Date ranges', 'Distinct counts'],
    prompt: 'For each month-end, count subscriptions active on that date and calculate their recurring monthly value.',
    constraints: ['A subscription starts on or before month-end.', 'A cancellation on month-end is still active through that date.', 'Include all months in the calendar table.'],
    contract: 'month_end DATE, active_subscriptions BIGINT, monthly_value DECIMAL',
    hints: ['Treat start_date as inclusive and cancelled_at as inclusive for active-through date.', 'Use a LEFT JOIN to preserve months with no subscriptions.', 'COALESCE the sum to zero.'],
    solution: `SELECT c.month_end,
       COUNT(s.subscription_id) AS active_subscriptions,
       COALESCE(SUM(s.monthly_price), 0) AS monthly_value
FROM calendar_months c
LEFT JOIN subscriptions s
  ON s.start_date <= c.month_end
 AND (s.cancelled_at IS NULL OR s.cancelled_at >= c.month_end)
GROUP BY c.month_end
ORDER BY c.month_end`,
    explanation: 'The left join retains empty months. Start and cancellation boundaries are inclusive for the month-end snapshot.',
    starter: `-- Keep every month, even if it has no active subscriptions\nSELECT c.month_end,\n       COUNT(s.subscription_id) AS active_subscriptions,\n       COALESCE(SUM(s.monthly_price), 0) AS monthly_value\nFROM calendar_months c\nLEFT JOIN subscriptions s ON\nGROUP BY c.month_end\nORDER BY c.month_end`,
    datasets: [
      { name: 'Sample dataset', tables: { calendar_months: table([['month_end', 'DATE']], [['2026-08-31'], ['2026-09-30'], ['2026-10-31']]), subscriptions: table([['subscription_id', 'INTEGER'], ['start_date', 'DATE'], ['cancelled_at', 'DATE'], ['monthly_price', 'DOUBLE']], [[1, '2026-08-01', null, 20], [2, '2026-08-15', '2026-09-30', 35], [3, '2026-10-01', null, 50], [4, '2026-11-01', null, 99]]) } },
      { name: 'Edge cases', tables: { calendar_months: table([['month_end', 'DATE']], [['2026-11-30'], ['2026-12-31']]), subscriptions: table([['subscription_id', 'INTEGER'], ['start_date', 'DATE'], ['cancelled_at', 'DATE'], ['monthly_price', 'DOUBLE']], [[5, '2026-11-30', '2026-12-31', 10], [6, '2026-12-31', '2026-12-31', 25], [7, '2027-01-01', null, 30]]) } },
    ],
  },
]

type PythonChallengeSeed = Omit<Challenge, 'datasets'> & { datasets: { name: string; input: unknown }[] }

const py = (seed: PythonChallengeSeed): Challenge => ({
  ...seed,
  datasets: seed.datasets.map((dataset) => ({ name: dataset.name, input: dataset.input, tables: {} })),
})

const pythonChallenges: Challenge[] = [
  py({
    id: 101, title: 'Top spenders by city', difficulty: 'INTERMEDIATE', tags: ['Dictionaries', 'Sorting'],
    prompt: 'Summarize paid order totals per customer and return the top customer in each city.',
    constraints: ['Ignore orders that are not paid.', 'Resolve city ties by customer name alphabetically.', 'Return city, customer, and spend.'],
    contract: 'A list of objects with city, customer, and spend keys.',
    hints: ['Build totals keyed by (city, customer).', 'Sort each city’s candidates by spend descending.', 'Return one winner per city.'],
    solution: `def solve(data):
    totals = {}
    for row in data:
        if row["status"] == "paid":
            key = (row["city"], row["customer"])
            totals[key] = totals.get(key, 0) + row["amount"]
    winners = {}
    for (city, customer), spend in totals.items():
        candidate = {"city": city, "customer": customer, "spend": spend}
        if city not in winners or (-spend, customer) < (-winners[city]["spend"], winners[city]["customer"]):
            winners[city] = candidate
    return sorted(winners.values(), key=lambda row: row["city"])`,
    explanation: 'Aggregate only paid transactions, then choose a deterministic winner for each city by spend and customer name.',
    starter: `def solve(data):
    # Return one top spender per city
    return []`,
    datasets: [
      { name: 'Sample dataset', input: [{ city: 'Mumbai', customer: 'Asha', status: 'paid', amount: 80 }, { city: 'Mumbai', customer: 'Asha', status: 'paid', amount: 20 }, { city: 'Mumbai', customer: 'Dev', status: 'paid', amount: 100 }, { city: 'Pune', customer: 'Ira', status: 'pending', amount: 900 }, { city: 'Pune', customer: 'Neel', status: 'paid', amount: 50 }] },
      { name: 'Edge cases', input: [{ city: 'Delhi', customer: 'Anu', status: 'paid', amount: 0 }, { city: 'Delhi', customer: 'Bala', status: 'paid', amount: 0 }, { city: 'Goa', customer: 'Uma', status: 'refunded', amount: 120 }] },
    ],
  }),
  py({
    id: 102, title: 'Deduplicate event stream', difficulty: 'INTERMEDIATE', tags: ['Sets', 'Stable ordering'],
    prompt: 'Keep the first occurrence of each event_id and return the retained events in input order.',
    constraints: ['Do not mutate the input list.', 'First occurrence wins.', 'Preserve every field on the retained row.'],
    contract: 'A list of event dictionaries.',
    hints: ['Track identifiers you have already seen.', 'Append only when an event_id is new.', 'A set gives constant-time membership checks.'],
    solution: `def solve(data):
    seen = set()
    result = []
    for row in data:
        if row["event_id"] not in seen:
            seen.add(row["event_id"])
            result.append(row.copy())
    return result`,
    explanation: 'The set records identifiers while the result list preserves the original arrival order and first-seen copy.',
    starter: `def solve(data):
    seen = set()
    result = []
    # Keep only the first row for each event_id
    return result`,
    datasets: [{ name: 'Sample dataset', input: [{ event_id: 'a', value: 1 }, { event_id: 'b', value: 2 }, { event_id: 'a', value: 3 }] }, { name: 'Edge cases', input: [{ event_id: 'x', value: null }, { event_id: 'x', value: 0 }, { event_id: 'y', value: 0 }, { event_id: 'z', value: false }] }],
  }),
  py({
    id: 103, title: 'Rolling three-day totals', difficulty: 'ADVANCED', tags: ['Dates', 'Aggregation'],
    prompt: 'For every daily record, compute a rolling sum over that date and the previous two calendar days.',
    constraints: ['Dates are ISO YYYY-MM-DD strings.', 'Missing dates contribute zero.', 'Return rows in date order.'],
    contract: 'A list of objects with date and rolling_total.',
    hints: ['Parse dates with datetime.date.fromisoformat.', 'Store one total per date, then walk each date.', 'Sum from date - 2 days through date inclusive.'],
    solution: `from datetime import date, timedelta
def solve(data):
    totals = {}
    for row in data:
        day = date.fromisoformat(row["date"])
        totals[day] = totals.get(day, 0) + row["amount"]
    result = []
    for day in sorted(totals):
        rolling = sum(totals.get(day - timedelta(days=offset), 0) for offset in range(3))
        result.append({"date": day.isoformat(), "rolling_total": rolling})
    return result`,
    explanation: 'Aggregate duplicate daily rows first. The rolling window uses calendar offsets, so absent days are naturally zero.',
    starter: `from datetime import date, timedelta
def solve(data):
    # Return date and rolling_total for each observed date
    return []`,
    datasets: [{ name: 'Sample dataset', input: [{ date: '2026-01-01', amount: 4 }, { date: '2026-01-02', amount: 6 }, { date: '2026-01-04', amount: 5 }, { date: '2026-01-04', amount: 2 }] }, { name: 'Edge cases', input: [{ date: '2026-02-28', amount: 1 }, { date: '2026-03-01', amount: 3 }, { date: '2026-03-02', amount: 4 }] }],
  }),
  py({
    id: 104, title: 'Nested team headcount', difficulty: 'INTERMEDIATE', tags: ['Trees', 'Recursion'],
    prompt: 'Given employees with manager_id links, calculate each manager’s total number of reports at any depth.',
    constraints: ['The org chart is acyclic.', 'Count each person once per manager.', 'Return managers sorted by employee_id.'],
    contract: 'A list of objects with employee_id and report_count.',
    hints: ['Build a mapping from manager to direct reports.', 'Walk descendants from each manager.', 'Do not count the manager themself.'],
    solution: `def solve(data):
    children = {}
    for row in data:
        children.setdefault(row["manager_id"], []).append(row["employee_id"])
    result = []
    managers = sorted({row["manager_id"] for row in data if row["manager_id"] is not None})
    for manager in managers:
        stack = list(children.get(manager, []))
        seen = set()
        while stack:
            person = stack.pop()
            if person not in seen:
                seen.add(person)
                stack.extend(children.get(person, []))
        result.append({"employee_id": manager, "report_count": len(seen)})
    return result`,
    explanation: 'Build adjacency lists, then traverse every descendant from each manager. The seen set ensures each report is counted only once.',
    starter: `def solve(data):
    children = {}
    # Build manager -> direct reports, then traverse descendants
    return []`,
    datasets: [{ name: 'Sample dataset', input: [{ employee_id: 2, manager_id: 1 }, { employee_id: 3, manager_id: 1 }, { employee_id: 4, manager_id: 2 }, { employee_id: 5, manager_id: 4 }] }, { name: 'Edge cases', input: [{ employee_id: 8, manager_id: 7 }, { employee_id: 9, manager_id: 8 }, { employee_id: 10, manager_id: 7 }, { employee_id: 11, manager_id: null }] }],
  }),
  py({
    id: 105, title: 'Normalize customer records', difficulty: 'FOUNDATION', tags: ['Strings', 'Null handling'],
    prompt: 'Clean customer names and email addresses, then discard rows that do not have a usable email.',
    constraints: ['Trim whitespace from both fields.', 'Lowercase emails only.', 'Keep the first row for each normalized email.'],
    contract: 'A list of objects with name and email keys.',
    hints: ['Call strip() before testing for blank values.', 'Use a set to track normalized email addresses.', 'Preserve the first valid normalized record.'],
    solution: `def solve(data):
    seen = set()
    result = []
    for row in data:
        email = (row.get("email") or "").strip().lower()
        name = (row.get("name") or "").strip()
        if email and email not in seen:
            seen.add(email)
            result.append({"name": name, "email": email})
    return result`,
    explanation: 'Normalize before deduplicating. Blank and missing email values are discarded; first valid record wins.',
    starter: `def solve(data):
    seen = set()
    result = []
    # Normalize and deduplicate
    return result`,
    datasets: [{ name: 'Sample dataset', input: [{ name: ' Ria ', email: ' RIA@EXAMPLE.COM ' }, { name: 'Ria duplicate', email: 'ria@example.com' }, { name: 'No address', email: null }, { name: 'Sam', email: ' sam@example.com' }] }, { name: 'Edge cases', input: [{ name: '  ', email: 'blank@example.com' }, { name: 'Nina', email: '   ' }, { name: 'Ivo', email: 'IVO@example.org' }] }],
  }),
  py({
    id: 106, title: 'Longest uninterrupted streak', difficulty: 'ADVANCED', tags: ['Sets', 'Sequences'],
    prompt: 'Find each user’s longest sequence of consecutive active days.',
    constraints: ['Duplicate user/day events count once.', 'Return every user in the input.', 'Sort by user_id.'],
    contract: 'A list of objects with user_id and longest_streak.',
    hints: ['Group unique dates by user.', 'Sort each user’s dates.', 'Start a new streak when the gap exceeds one day.'],
    solution: `from datetime import date
def solve(data):
    days = {}
    for row in data:
        days.setdefault(row["user_id"], set()).add(date.fromisoformat(row["day"]))
    result = []
    for user_id in sorted(days):
        streak = best = 0
        previous = None
        for day in sorted(days[user_id]):
            streak = streak + 1 if previous and (day - previous).days == 1 else 1
            best = max(best, streak)
            previous = day
        result.append({"user_id": user_id, "longest_streak": best})
    return result`,
    explanation: 'Deduplicate dates before sorting. The streak increments only when the current date is exactly one day after the previous date.',
    starter: `from datetime import date
def solve(data):
    # Return one longest_streak per user_id
    return []`,
    datasets: [{ name: 'Sample dataset', input: [{ user_id: 1, day: '2026-01-01' }, { user_id: 1, day: '2026-01-02' }, { user_id: 1, day: '2026-01-04' }, { user_id: 2, day: '2026-01-08' }] }, { name: 'Edge cases', input: [{ user_id: 3, day: '2026-02-28' }, { user_id: 3, day: '2026-02-28' }, { user_id: 3, day: '2026-03-01' }, { user_id: 4, day: '2026-03-20' }] }],
  }),
  py({
    id: 107, title: 'Inventory movement reconciliation', difficulty: 'INTERMEDIATE', tags: ['Aggregation', 'Dictionaries'],
    prompt: 'Apply signed inventory movements to opening stock and report the resulting quantity per SKU.',
    constraints: ['Movement type IN increases and OUT decreases stock.', 'Keep SKUs with no movement.', 'Return SKUs alphabetically.'],
    contract: 'A list of objects with sku and ending_stock.',
    hints: ['Start from each opening quantity.', 'Convert each movement into a signed amount.', 'Use a dictionary keyed by SKU.'],
    solution: `def solve(data):
    stock = {row["sku"]: row["opening"] for row in data["opening"]}
    for row in data["movements"]:
        delta = row["quantity"] if row["type"] == "IN" else -row["quantity"]
        stock[row["sku"]] = stock.get(row["sku"], 0) + delta
    return [{"sku": sku, "ending_stock": stock[sku]} for sku in sorted(stock)]`,
    explanation: 'Each movement contributes a signed delta. Initial SKUs remain in the output even without movements.',
    starter: `def solve(data):
    stock = {}
    # Apply signed movements
    return []`,
    datasets: [{ name: 'Sample dataset', input: { opening: [{ sku: 'A', opening: 10 }, { sku: 'B', opening: 4 }], movements: [{ sku: 'A', type: 'OUT', quantity: 3 }, { sku: 'C', type: 'IN', quantity: 5 }] } }, { name: 'Edge cases', input: { opening: [{ sku: 'X', opening: 0 }, { sku: 'Y', opening: 2 }], movements: [{ sku: 'X', type: 'IN', quantity: 0 }, { sku: 'Y', type: 'OUT', quantity: 2 }] } }],
  }),
  py({
    id: 108, title: 'Group overlapping appointments', difficulty: 'ADVANCED', tags: ['Intervals', 'Sorting'],
    prompt: 'Merge overlapping time intervals and return each combined interval in chronological order.',
    constraints: ['Intervals that touch at an endpoint count as overlapping.', 'Input intervals may be unsorted.', 'Do not mutate the input.'],
    contract: 'A list of [start, end] intervals.',
    hints: ['Sort a copy by start time.', 'If the next start is at or before the current end, extend the end.', 'Otherwise append a new interval.'],
    solution: `def solve(data):
    intervals = sorted((row[0], row[1]) for row in data)
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged`,
    explanation: 'After sorting, only the most recent merged interval can overlap the next interval. Inclusive endpoint comparison also merges touching intervals.',
    starter: `def solve(data):
    intervals = sorted(data)
    merged = []
    # Merge overlapping or touching intervals
    return merged`,
    datasets: [{ name: 'Sample dataset', input: [[1, 4], [3, 6], [8, 9], [9, 12]] }, { name: 'Edge cases', input: [[5, 7], [1, 2], [2, 2], [10, 11]] }],
  }),
  py({
    id: 109, title: 'Per-category running balances', difficulty: 'INTERMEDIATE', tags: ['Sorting', 'Cumulative sums'],
    prompt: 'Calculate a running transaction balance separately for each account.',
    constraints: ['Order within an account by date, then transaction_id.', 'A running balance starts at zero.', 'Return rows sorted by account_id and transaction order.'],
    contract: 'A list of objects with account_id, transaction_id, and balance.',
    hints: ['Group transactions by account.', 'Sort each group using both ordering fields.', 'Accumulate each signed amount.'],
    solution: `def solve(data):
    groups = {}
    for row in data:
        groups.setdefault(row["account_id"], []).append(row)
    result = []
    for account_id in sorted(groups):
        balance = 0
        for row in sorted(groups[account_id], key=lambda item: (item["date"], item["transaction_id"])):
            balance += row["amount"]
            result.append({"account_id": account_id, "transaction_id": row["transaction_id"], "balance": balance})
    return result`,
    explanation: 'Each account has an independent cumulative sum. Explicit tie-breaking by transaction ID makes results stable when dates match.',
    starter: `def solve(data):
    groups = {}
    # Group, order, and accumulate transactions
    return []`,
    datasets: [{ name: 'Sample dataset', input: [{ account_id: 2, transaction_id: 2, date: '2026-01-02', amount: -5 }, { account_id: 1, transaction_id: 1, date: '2026-01-01', amount: 10 }, { account_id: 2, transaction_id: 1, date: '2026-01-02', amount: 12 }] }, { name: 'Edge cases', input: [{ account_id: 3, transaction_id: 2, date: '2026-02-01', amount: 0 }, { account_id: 3, transaction_id: 1, date: '2026-02-01', amount: 4 }, { account_id: 1, transaction_id: 3, date: '2026-02-03', amount: -2 }] }],
  }),
  py({
    id: 110, title: 'First available appointment slot', difficulty: 'FOUNDATION', tags: ['Intervals', 'Search'],
    prompt: 'Find the earliest available slot that can fit a requested appointment duration.',
    constraints: ['Slots use integer start and end minutes.', 'A slot fits when end - start is at least duration.', 'Return null when none fit.'],
    contract: 'An object with start and end, or null.',
    hints: ['Sort slots by start.', 'Find the first slot whose duration is sufficient.', 'Return only the slot boundaries.'],
    solution: `def solve(data):
    for start, end in sorted(data["slots"]):
        if end - start >= data["duration"]:
            return {"start": start, "end": end}
    return None`,
    explanation: 'Sorting guarantees the first qualifying slot is earliest. The duration check includes an exact fit.',
    starter: `def solve(data):
    # Find the earliest slot that fits
    return None`,
    datasets: [{ name: 'Sample dataset', input: { duration: 30, slots: [[90, 110], [15, 50], [60, 120]] } }, { name: 'Edge cases', input: { duration: 0, slots: [[20, 20], [0, 10]] } }],
  }),
]

export const challenges: Record<Language, Challenge[]> = { sql: sqlChallenges, python: pythonChallenges }
