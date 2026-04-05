// src/constants/demoData.ts
import type { FormType } from '../types';

export const DEMO_DATA: FormType[] = [
    {
        id: 'demo-1',
        problem: 'Two Sum',
        problemNumber: '1',
        patterns: ['Hash Map'],
        difficulty: 'Easy',
        date: '1743120000000',
        solved: true,
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        trippedUp: 'Used of instead of in to get indices. Set obj[complement] = i instead of obj[nums[i]] = i. Switched to regular for loop because for let idx in nums returns string indices.',
        explanation: 'Hashmap over two pointers because array isn\'t sorted and I prioritized O(n) time over O(1) space. Track complements as we iterate — if the complement exists in the map, we found our pair.'
    },
    {
        id: 'demo-2',
        problem: 'Group Anagrams',
        problemNumber: '49',
        patterns: ['Hash Map'],
        difficulty: 'Medium',
        date: '1743120000000',
        solved: true,
        timeComplexity: 'O(n * k log k)',
        spaceComplexity: 'O(n * k)',
        trippedUp: 'Didn\'t push the current word when creating a new key. Grabbed both key and value when iterating the map but the key doesn\'t belong in the output.',
        explanation: 'Sort each word to get its anagram key. Group words by that key in a hashmap. Output is the values of the map.'
    },
    {
        id: 'demo-3',
        problem: 'Longest Consecutive Sequence',
        problemNumber: '128',
        patterns: ['Hash Map'],
        difficulty: 'Medium',
        date: '1743120000000',
        solved: true,
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        trippedUp: 'Tried to sort first which gives O(n log n). Key insight is only starting a sequence from numbers with no left neighbor.',
        explanation: 'Put all numbers in a Set for O(1) lookup. Only start counting a sequence if num - 1 doesn\'t exist. Track the longest.'
    },
    {
        id: 'demo-4',
        problem: 'Top K Frequent Elements',
        problemNumber: '347',
        patterns: ['Hash Map'],
        difficulty: 'Medium',
        date: '1743206400000',
        solved: true,
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        trippedUp: 'new Array(new Array(n)) creates 1 slot not n slots. Assigned buckets[freq] = num which overwrites — each bucket needs to be an array.',
        explanation: 'Count frequency of each number. Use frequency as array index — bucket sort. Read from back until you have k elements.'
    },
    {
        id: 'demo-5',
        problem: 'Longest Substring with At Most K Distinct Characters',
        problemNumber: '340',
        patterns: ['Sliding Window', 'Hash Map'],
        difficulty: 'Medium',
        date: '1743206400000',
        solved: true,
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(k)',
        trippedUp: 'Checked < 0 instead of === 0 for deletion. Tracked max inside shrink block instead of after it. Started r = 1 and pre-loaded first element.',
        explanation: 'Sliding window for contiguous substring with constraint. Hashmap for character counts — map.size tells distinct characters. Shrink left when map.size > k.'
    },
    {
        id: 'demo-6',
        problem: '3Sum',
        problemNumber: '15',
        patterns: ['Two Pointers'],
        difficulty: 'Medium',
        date: '1743638400000',
        solved: true,
        timeComplexity: 'O(n^2)',
        spaceComplexity: 'O(1)',
        trippedUp: 'Jumped straight to hashmap instead of thinking while (l < r). Missed duplicate checking for the outer loop.',
        explanation: 'Sort for directional confidence. If sum > 0 move r left, if < 0 move l right. When sum === 0 push triplet and skip duplicates.'
    },
    {
        id: 'demo-7',
        problem: 'Container With Most Water',
        problemNumber: '11',
        patterns: ['Two Pointers'],
        difficulty: 'Medium',
        date: '1743552000000',
        solved: true,
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(1)',
        trippedUp: 'Thought it was sliding window. Assumed two pointers only works on sorted arrays. Missed that area is capped by the shorter wall.',
        explanation: 'Move the shorter pointer inward — area is always capped by the shorter wall. Area = min(heights[l], heights[r]) * (r - l).'
    }
];